#!/usr/bin/env node
require("epipebomb")();
const osm2obj = require("osm2obj");
const stringify = require("stringify-stream");

process.on("unhandledRejection", err => {
  console.error(err.stack);
  process.exit(1);
});

const {
  parsers: { AugmentedDiffParser },
  sources: { AugmentedDiffs }
} = require("..");

const rs = AugmentedDiffs({
  infinite: true,
  // initialSequence: 2801986,
  checkpoint: sequenceNumber => console.warn(`${sequenceNumber} fetched.`)
});

// process.stdin
rs
  .pipe(new AugmentedDiffParser().on("error", err => console.warn(err)))
  .pipe(stringify())
  .pipe(process.stdout);
// rs
//   .pipe(
//     osm2obj({
//       coerceIds: false
//     })
//   )
//   .pipe(stringify())
//   .pipe(process.stdout);
