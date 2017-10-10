const { Writable } = require("stream");

const AWS = require("aws-sdk");

const kinesis = new AWS.Kinesis();

class KinesisStream extends Writable {
  constructor(streamName, partitionKey = null) {
    super();

    this.streamName = streamName;
    this.partitionKey = partitionKey || streamName;
  }

  _write(chunk, encoding, callback) {
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
