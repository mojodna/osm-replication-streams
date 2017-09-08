const BinarySplitter = require("./binary_splitter");
const KinesisSink = require("./sinks/kinesis_stream");
const Changes = require("./sources/change_stream");
const Changesets = require("./sources/changeset_stream");
const KinesisSource = require("./sources/kinesis_stream");

module.exports = {
  BinarySplitter,
  sinks: {
    Kinesis: KinesisSink
  },
  sources: {
    Changes,
    Changesets,
    Kinesis: KinesisSource
  }
}
