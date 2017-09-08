const { Writable } = require("stream");

const AWS = require("aws-sdk");

const kinesis = new AWS.Kinesis();

class KinesisStream extends Writable {
  constructor(streamName, partitionKey = "a") {
    super();

    this.streamName = streamName;
    this.partitionKey = partitionKey;
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
