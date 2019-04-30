#!/usr/bin/env node
require("epipebomb")();

const {
  sources: { Kinesis: KinesisSource }
} = require("..");

KinesisSource({
  streamName: "changes-tmp"
}).pipe(process.stdout);
