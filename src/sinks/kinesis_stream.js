const { Writable } = require("stream");

const async = require("async");
const AWS = require("aws-sdk");

const CONCURRENCY = 128;

const kinesis = new AWS.Kinesis();

class KinesisStream extends Writable {
  constructor(streamName, partitionKey = null) {
    super();

    this.streamName = streamName;
    this.partitionKey = partitionKey || streamName;
    this.pending = 0;
  }

  _write(chunk, encoding, callback) {
    this.pending++;

    let blind = false;

    if (this.pending < CONCURRENCY) {
      // report successful writes preemptively
      blind = true;
      callback();
    }

    // TODO check chunk size to ensure that it's < 1MB
    return kinesis.putRecord(
      {
        Data: chunk,
        PartitionKey: this.partitionKey,
        StreamName: this.streamName
      },
      err => {
        this.pending--;

        if (blind && err) {
          console.warn(err);
        }

        if (!blind) {
          process.stdout.write("o")
          return callback(err);
        }

        process.stdout.write("O")
      }
    );
  }

  _final(callback) {
    // wait until all pending writes have flushed
    return async.until(() => this.pending === 0, setImmediate, callback);
  }
}

module.exports = KinesisStream;
