const BinarySplitter = require("./binary_splitter");
const EventHubSink = require("./sinks/event_hub");
const KinesisSink = require("./sinks/kinesis_stream");
const Changes = require("./sources/change_stream");
const Changesets = require("./sources/changeset_stream");
const KinesisSource = require("./sources/kinesis_stream");

module.exports = {
  BinarySplitter,
  sinks: {
    EventHub: EventHubSink,
    Kinesis: KinesisSink
  },
  sources: {
    Changes,
    Changesets,
    Kinesis: KinesisSource
  }
}
