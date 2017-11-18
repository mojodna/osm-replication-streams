const { Writable } = require("stream");

const async = require("async");
const { Client } = require("azure-event-hubs");
const promiseRetry = require("promise-retry");

const CONCURRENCY = 128;

/* eslint-disable promise/avoid-new */
const wait = () => new Promise(resolve => setImmediate(resolve));

class EventHub extends Writable {
  constructor(connectionString, path = null) {
    super({
      objectMode: true
    });

    this.connectionString = connectionString;
    this.path = path;
    this.sender = null;
    this.pending = 0;
    this.connecting = false;
  }

  async connect() {
    while (this.connecting) {
      /* eslint-disable no-await-in-loop */
      await wait();
    }

    /* eslint-disable no-underscore-dangle */
    if (this.sender != null && this.sender._senderLink.canSend()) {
      return this.sender;
    }

    this.connecting = true;

    const client = Client.fromConnectionString(
      this.connectionString,
      this.path
    );
    await client.open();

    this.sender = await client.createSender();

    this.sender.on("errorReceived", err =>
      console.warn("sender error:", err.stack)
    );

    this.connecting = false;

    return this.sender;
  }

  _write(obj, _, callback) {
    this.pending++;

    let blind = false;

    if (this.pending < CONCURRENCY) {
      // report successful writes preemptively
      blind = true;
      callback();
    }

    return (
      promiseRetry(
        {
          retries: 2,
          minTimeout: 0
        },
        retry =>
          this.connect()
            .then(sender => sender.send(obj))
            .catch(err => this.connect().then(() => retry(err)))
      )
        // callback if this wasn't submitted blindly
        .then(() => blind || callback())
        .catch(err => (blind ? this.emit(err) : callback(err)))
        .then(() => this.pending--)
    );
  }

  _final(callback) {
    // wait until all pending writes have flushed
    return async.until(() => this.pending === 0, setImmediate, () =>
      this.client
        .close()
        .then(callback)
        .catch(callback)
    );
  }
}

module.exports = EventHub;
