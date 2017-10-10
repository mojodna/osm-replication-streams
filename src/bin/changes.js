#!/usr/bin/env node
require("epipebomb")();
const osm2obj = require("osm2obj");
const stringify = require("stringify-stream");

const {
  BinarySplitter,
  // sinks: { Kinesis },
  sources: { Changes, Kinesis: KinesisSource }
} = require("..");

// const rs = Changes({
//   infinite: true,
//   checkpoint: sequenceNumber => console.warn(`${sequenceNumber} fetched.`)
// });
//
// rs.pipe(process.stdout);
// rs
//   .pipe(
//     osm2obj({
//       coerceIds: false
//     })
//   )
//   .pipe(stringify())
//   .pipe(process.stdout);
// rs.pipe(new BinarySplitter("\u001e")).pipe(new KinesisStream("changes-xml"))

KinesisSource({
  streamName: "changes-xml"
}).pipe(process.stdout);
