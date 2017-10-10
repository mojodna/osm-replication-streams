# OSM Replication Stream Cookbook

## OSM Changes as XML

```javascript
const { sources: { Changes } } = require("osm-replication-streams");

Changes({
  infinite: true
}).pipe(process.stdout);
```

## OSM Changes as JSON

```javascript
const osm2obj = require("osm2obj");
const { sources: { Changes } } = require("osm-replication-streams");
const stringify = require("stringify-stream");

Changes({
  infinite: true,
})
  .pipe(
    osm2obj(),
  )
  .pipe(stringify())
  .pipe(process.stdout);
```

## OSM Changes as XML from Kinesis

```javascript
const { sources: { Kinesis: KinesisSource } } = require("osm-replication-streams");

KinesisSource({
  streamName: "changes-xml",
}).pipe(process.stdout);
```

## OSM Changes as Objects from Kinesis

```javascript
const JSONStream = require('JSONStream');
const { sources: { Kinesis: KinesisSource } } = require("osm-replication-streams");

KinesisSource({
  streamName: "changes-json",
})
  .pipe(JSONStream.parse("."))
  .on("data", obj => console.log("%j", obj));
```

## Publish OSM Changes as XML to Kinesis

**Warning**: payloads may be excessively large.

```javascript
const {
  sinks: { Kinesis },
  sources: { Changes },
} = require("osm-replication-streams");

Changes({
  infinite: true,
})
  // ensure that payloads are split on document boundaries
  .pipe(new BinarySplitter("\u001e")
  .pipe(new Kinesis("changes-xml"));
```

## Publish OSM Changes as JSON to Kinesis

```javascript
const osm2obj = require("osm2obj");
const {
  sinks: { Kinesis },
  sources: { Changes },
} = require("osm-replication-streams");
const stringify = require("stringify-stream");

Changes({
  infinite: true,
})
  .pipe(
    osm2obj(),
  )
  .pipe(stringify())
  .pipe(new Kinesis("changes-json"));
```

## Merge Changes and Changesets

```javascript
const osm2obj = require("osm2obj");
const { sources: { Changes, Changesets } } = require("osm-replication-streams");
const stringify = require("stringify-stream");

const target = osm2obj()
  .pipe(stringify())
  .pipe(process.stdout);

Changes({
  infinite: true,
}).pipe(target);

Changesets({
  infinite: true,
}).pipe(target);
```

## Checkpoint Replication Reads

```javascript
const { sources: { Changes } } = require("osm-replication-streams");

Changes({
  infinite: true,
  checkpoint: sequenceNumber => console.warn(`${sequenceNumber} fetched.`)
}).pipe(process.stdout);
```
