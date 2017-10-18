#!/usr/bin/env node
const { PassThrough, Transform } = require("stream");

require("epipebomb")();
const LRU = require("lru-cache");
const osm2obj = require("osm2obj");
const prettyBytes = require("pretty-bytes");
const stringify = require("stringify-stream");

const { sources: { Changes, Changesets } } = require("..");

const TAGS_OF_INTEREST = ["building"];

// level 1 cache
const cache = LRU({
  max: 10 * 1024 * 1024,
  length: x => JSON.stringify(x).length,
});

// level 2 cache
// TODO redis

// level 3 "cache"
// TODO fetch elements from OSM

// TODO this should have a TTL of 5 min after the changeset is seen as closed
const watchList = new Set();
let lastChangeset = 0;

setInterval(() => {
  console.log();
  console.log("Tracking %d changesets", watchList.size)
  console.log("Cache size: %s (%s)", cache.itemCount.toLocaleString(), prettyBytes(cache.length));
}, 60e3).unref();

let isInterestingChangeset = (changeset, hashtags) => hashtags != null;

// isInterestingChangeset = () => true;

const processChangeset = (changeset, callback) => {
  // TODO remap users if necessary
  // TODO track edits by editor type
  const {
    id,
    open,
    tags: { comment, created_by, locale, source },
    uid,
    user,
  } = changeset;

  let { closed_at, created_at, tags: { hashtags, imagery_used } } = changeset;
  closed_at = new Date(closed_at);
  created_at = new Date(created_at);

  const key = `changeset-elements:${id}`;
  // track the most recent changeset id so we can avoid caching elements older
  // than it that we're not watching
  lastChangeset = Math.max(lastChangeset, id);

  // TODO and created_at >= iD 2.4.3 release date
  if (hashtags != null) {
    hashtags = Array.from(new Set(hashtags.split(";").map(x => x.trim())));
  } else if (comment != null) {
    hashtags = Array.from(new Set(comment.match(/(#[^\u2000-\u206F\u2E00-\u2E7F\s\\'!"#$%()*,./:;<=>?@[\]^`{|}~]+)/g)));
  } else {
    hashtags = [];
  }

  if (imagery_used != null) {
    imagery_used = imagery_used.split(";").map(x => x.trim());
  }

  if (!isInterestingChangeset(changeset, hashtags)) {
    // clear out cached items associated with this changeset; not needed since
    // we don't care about it
    cache.del(key);
    return callback();
  }

  watchList.add(id);

  hashtags = hashtags.map(x => x.toLowerCase());

  console.log("\nchangeset id: %s (%s) - %s", id, open ? "open" : "closed", created_by, locale ? `(${locale})` : "", imagery_used || "", source || "");
  console.log(hashtags.join(", "));

  // TODO find elements associated with this changeset
  const elements = cache.get(key);

  if (elements != null) {
    const nodes = elements.filter(x => x.type === "node");
    const ways = elements.filter(x => x.type === "way");
    const relations = elements.filter(x => x.type === "relation");

    console.log("%d nodes", nodes.length);
    console.log("%d ways", ways.length);
    console.log("%d relations", relations.length);

    const buildingWays = ways
      .map(
        x =>
          Object.keys(x.tags || {}).filter(tag =>
            TAGS_OF_INTEREST.includes(tag),
          ).length,
      )
      .reduce((total, x) => total + x, 0);

    const newBuildings = ways
      // TODO or x.action === "create"
      .filter(x => x.version === 1)
      .map(
        x =>
          Object.keys(x.tags || {}).filter(tag =>
            TAGS_OF_INTEREST.includes(tag),
          ).length,
      )
      .reduce((total, x) => total + x, 0);

    const modifiedBuildings = ways
      .filter(x => x.version > 1 && x.action !== "delete")
      .map(
        x =>
          Object.keys(x.tags || {}).filter(tag =>
            TAGS_OF_INTEREST.includes(tag),
          ).length,
      )
      .reduce((total, x) => total + x, 0);

    // TODO way complexity (average nd.length)

    console.log("building ways:", buildingWays);
    console.log("new buildings:", newBuildings);
    console.log("modified buildings:", modifiedBuildings);

    // TODO update changeset summary

    // clean up

    // clear out elements that were being held for us
    cache.del(key);

    // set a timer to remove this changeset 5 min after it's closed to give us 5 minutes to pick up stragglers
    // TODO work in sequence numbers, not minutes
    if (!open) {
      setTimeout(() => {
        console.log("Unwatching", id);
        watchList.delete(id);
      }, 5 * 60 * 1000);
    }
  }

  return callback();
};

const processElement = (element, callback) => {
  const key = `changeset-elements:${element.changeset}`;

  if (element.action === "delete") {
    element.visible = false;
  }

  switch (element.type) {
    case "node":
      // we need to be able to look up nodes in case they're part of ways that we're measuring
      cache.set(`${element.type}:${element.id}`, element);
      if (watchList.has(element.changeset)) {
        // TODO process node
        if (element.tags != null) {
          // console.log("node tags:", element.tags);
          process.stdout.write(".");
        }
      } else if (element.changeset > lastChangeset) {
        // stash for future use; we don't know anything about this changeset yet
        cache.set(key, (cache.get(key) || []).concat(element));
      }
      return callback();

    case "way":
    case "relation":
      if (watchList.has(element.changeset)) {
        // TODO process element
        if (element.tags != null) {
          // console.log("%s tags:", element.type, element.tags);
          process.stdout.write("*");
        }
      } else if (element.changeset > lastChangeset) {
        // stash for future use; we don't know anything about this changeset yet
        cache.set(key, (cache.get(key) || []).concat(element));
      }
      return callback();

    case "changeset":
      try {
        console.log(element);
        return processChangeset(element, callback);
      } catch (err) {
        console.error(err.stack);
        process.exit(1);
      }

    default:
      console.warn("Unrecognized type:", element.type);
      return callback();
  }
};

const analyzer = new Transform({
  objectMode: true,
});

analyzer._write = (obj, _, callback) => {
  process.stderr.write(JSON.stringify(obj))
  return callback();
  // processElement(obj, callback);
};

analyzer._writev = (objs, _, callback) => {
  console.log("objs:", objs);
  process.exit();

  return callback();
};

const changesets = Changesets({
  infinite: false,
  initialSequence: -60, // 2580891
  checkpoint: sequenceNumber => console.log(`changeset sequence ${sequenceNumber} fetched.`)
}).pipe(osm2obj());

const changes = Changes({
  infinite: false,
  initialSequence: -60, // 2660244
  checkpoint: sequenceNumber => console.log(`change sequence ${sequenceNumber} fetched.`)
}).pipe(osm2obj());

const merge = new PassThrough({
  objectMode: true,
}).pipe(analyzer);

changesets.pipe(merge);
// setTimeout(() => changesets.pipe(merge), 30e3);

// wait 30s to start reading changes so that the watch list can be populated
changes.pipe(merge);
// setTimeout(() => changes.pipe(merge), 0);

// changesets.pipe(stringify()).pipe(process.stdout);
