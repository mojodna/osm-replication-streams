const BinarySplitter = require("./binary_splitter");
const AugmentedDiffParser = require("./parsers/adiff");
const KinesisSink = require("./sinks/kinesis_stream");
const AugmentedDiffs = require("./sources/adiff_stream");
const Changes = require("./sources/change_stream");
const Changesets = require("./sources/changeset_stream");
const KinesisSource = require("./sources/kinesis_stream");

module.exports = {
  BinarySplitter,
  parsers: {
    AugmentedDiffParser,
  },
  sinks: {
    Kinesis: KinesisSink
  },
  sources: {
    AugmentedDiffs,
    Changes,
    Changesets,
    Kinesis: KinesisSource
  }
}
