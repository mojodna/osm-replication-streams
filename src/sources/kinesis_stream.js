const _ = require("highland");
const AWS = require("aws-sdk");
const promisify = require("util.promisify");

const kinesis = new AWS.Kinesis();

const describeStream = promisify(kinesis.describeStream.bind(kinesis));
const getRecords = promisify(kinesis.getRecords.bind(kinesis));
const getShardIterator = promisify(kinesis.getShardIterator.bind(kinesis));

module.exports = options => {
  const opts = {
    // we only expect records every minute
    delay: 15e3,
    ...options
  };

  let shardIterator;

  return _(async (push, next) => {
    const stream = await describeStream({
      StreamName: opts.streamName
    });

    const { StreamDescription: { Shards: shards } } = stream;

    if (shardIterator == null) {
      const rsp = await getShardIterator({
        // TODO create ShardIterators for all shards
        ShardId: shards[0].ShardId,
        // TODO make me configurable
        ShardIteratorType: "LATEST",
        StreamName: opts.streamName
      });

      shardIterator = rsp.ShardIterator;
    }

    try {
      const rsp = await getRecords({
        ShardIterator: shardIterator
      });

      const { MillisBehindLatest: lag, Records: records } = rsp;
      shardIterator = rsp.NextShardIterator;

      records.forEach(r => push(null, r.Data.toString()));

      // capture last SequenceNumber and store it if necessary

      if (lag === 0) {
        return setTimeout(next, opts.delay);
      }

      return next();
    } catch (err) {
      console.warn(err.stack);

      return push(err, _.nil);
    }
  });
};
