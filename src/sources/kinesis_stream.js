const _ = require("highland");
const AWS = require("aws-sdk");
const promisify = require("util.promisify");

const kinesis = new AWS.Kinesis();

const describeStream = promisify(kinesis.describeStream.bind(kinesis));
const getRecords = promisify(kinesis.getRecords.bind(kinesis));
const getShardIterator = promisify(kinesis.getShardIterator.bind(kinesis));

module.exports = async options => {
  const opts = {
    // we only expect records every minute
    delay: 15e3,
    ...options
  };

  const stream = await describeStream({
    StreamName: opts.streamName
  });

  const { StreamDescription: { Shards: shards } } = stream;

  let { ShardIterator: shardIterator } = await getShardIterator({
    ShardId: shards[0].ShardId,
    // TODO make me configurable
    ShardIteratorType: "LATEST",
    StreamName: opts.streamName
  });

  return _(async (push, next) => {
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
