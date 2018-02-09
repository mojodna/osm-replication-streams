#!/usr/bin/env node
require("epipebomb")();
const stringify = require("stringify-stream");

process.on("unhandledRejection", err => {
  console.error(err.stack);
  process.exit(1);
});

const {
  parsers: { AugmentedDiffParser },
  sources: { AugmentedDiffs }
} = require("..");

const checkpoint = sequenceNumber => console.warn(`${sequenceNumber} fetched.`);

const rs = AugmentedDiffs({
  infinite: true,
  initialSequence: 2813055
});

const processor = new AugmentedDiffParser()
  .on("error", console.warn)
  .on("sequenceEnd", checkpoint);

// process.stdin
rs
  .pipe(processor)
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
