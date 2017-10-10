const { Writable } = require("stream");

const AWS = require("aws-sdk");

const kinesis = new AWS.Kinesis();

class KinesisStream extends Writable {
  constructor(streamName, partitionKey = null) {
    super();

    this.streamName = streamName;
    this.partitionKey = partitionKey || streamName;
  }

  // TODO implement _writev for batch writes
  _write(chunk, encoding, callback) {
    // TODO check chunk size to ensure that it's < 1MB
    return kinesis.putRecord(
      {
        Data: chunk,
        PartitionKey: this.partitionKey,
        StreamName: this.streamName
      },
      callback
    );
  }
}

module.exports = KinesisStream;
