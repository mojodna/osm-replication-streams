#!/usr/bin/env node
require("epipebomb")();
const osm2obj = require("osm2obj");
const stringify = require("stringify-stream");

const { sinks: { Kinesis }, sources: { Changes } } = require("..");

const rs = Changes({
  infinite: true,
  checkpoint: sequenceNumber => console.warn(`${sequenceNumber} fetched.`)
});

rs
  .pipe(osm2obj())
  .pipe(stringify())
  .pipe(new Kinesis("changes-tmp"));

rs.on("finish", () => console.log("done"));
rs.on("error", err => console.warn("Stream error:", err));
