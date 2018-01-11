const BinarySplitter = require("./binary_splitter");
const AugmentedDiffParser = require("./parsers/adiff");
const EventHubSink = require("./sinks/event_hub");
const KinesisSink = require("./sinks/kinesis_stream");
const AugmentedDiffs = require("./sources/adiff_stream");
const Changes = require("./sources/change_stream");
const Changesets = require("./sources/changeset_stream");
const EventHubSource = require("./sources/event_hub");
const KinesisSource = require("./sources/kinesis_stream");

module.exports = {
  BinarySplitter,
  parsers: {
    AugmentedDiffParser,
  },
  sinks: {
    EventHub: EventHubSink,
    Kinesis: KinesisSink
  },
  sources: {
    AugmentedDiffs,
    Changes,
    Changesets,
    EventHub: EventHubSource,
    Kinesis: KinesisSource
  }
}
