#!/usr/bin/env node
// require("babel-polyfill");
require("epipebomb")();
const osm2obj = require("osm2obj");
const stringify = require("stringify-stream");

const {
  BinarySplitter,
  sinks: { Kinesis },
  sources: { Changes }
} = require("..");

function main() {
  const rs = Changes({
    infinite: true,
    checkpoint: sequenceNumber => console.warn(`${sequenceNumber} fetched.`)
  });

  // rs.pipe(process.stdout);
  rs
    .pipe(
      osm2obj({
        coerceIds: false
      })
    )
    .pipe(stringify())
    .pipe(process.stdout);
  // rs.pipe(new BinarySplitter("\u001e")).pipe(new KinesisStream("changes-xml"))

  // TODO when writing to kinesis, make sure that elements are ordered such that they don't depend on entities that haven't been flushed
}

main();
