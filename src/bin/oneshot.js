#!/usr/bin/env node
require('epipebomb')();
const osm2obj = require("osm2obj");
const stringify = require("stringify-stream")

const {
  BinarySplitter,
  sinks: { Kinesis },
  sources: { Changes }
} = require("..");

async function main() {
  const rs = await Changes({
    // infinite: true,
    checkpoint: sequenceNumber => console.warn(`${sequenceNumber} fetched.`)
  });

  // rs.pipe(process.stdout);
  // rs.pipe(Osm2Json()).pipe(stringify()).pipe(process.stdout);
  rs.pipe(new BinarySplitter("\u001e")).pipe(new Kinesis("changes-xml"))

  rs.on("finish", () => console.log("done"))

  // TODO when writing to kinesis, make sure that elements are ordered such that they don't depend on entities that haven't been flushed
}

main();
