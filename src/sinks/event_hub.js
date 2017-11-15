const { Writable } = require("stream");

const async = require("async");
const { Client } = require("azure-event-hubs");

const CONCURRENCY = 128;

class EventHub extends Writable {
  constructor(connectionString, path = null) {
    super({
      objectMode: true
    });

    this.client = Client.fromConnectionString(connectionString, path);
    this.sender = null;
    this.pending = 0;
  }

  async connect() {
    if (this.sender != null) {
      return this.sender;
    }

    await this.client.open();

    this.sender = await this.client.createSender();

    this.sender.on("errorReceived", err =>
      console.warn("sender error:", err.stack)
    );

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
      this.connect()
        .then(sender => sender.send(obj))
        // callback if this wasn't submitted blindly
        .then(() => blind || callback())
        .catch(callback)
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
