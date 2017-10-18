const { Transform } = require("stream");

const LRU = require("lru-cache");

const TAGS_OF_INTEREST = ["building"];

// level 1 cache
const cache = LRU({
  max: 10 * 1024 * 1024,
  length: x => JSON.stringify(x).length
});

// level 2 cache
// TODO redis

// level 3 "cache"
// TODO fetch elements from OSM

let lastChangeset = 0;

module.exports = class Analyzer extends Transform {
  constructor(options = {}) {
    super({
      objectMode: true
    });

    this.isChangesetInteresting =
      options.isChangesetInteresting || this.isChangesetInteresting;
    this.watchList = new Set();
  }

  _transform(obj, _, callback) {
    this.processElement(obj, callback);
  }

  isChangesetInteresting(changeset, hashtags) {
    return true;
  }

  processElement(element, callback) {
    const key = `changeset-elements:${element.changeset}`;

    if (element.action === "delete") {
      element.visible = false;
    }

    switch (element.type) {
      case "node":
      case "way":
      case "relation":
        // we need to be able to look up nodes in case they're part of ways that we're measuring
        cache.set(`${element.type}:${element.id}`, element);
        if (this.watchList.has(element.changeset)) {
          this.updateChangesetWithElement(element);
          if (element.tags != null) {
            // console.log("node tags:", element.tags);
            // process.stdout.write(".");
          }
        } else if (element.changeset > lastChangeset) {
          // stash for future use; we don't know anything about this changeset yet
          cache.set(key, (cache.get(key) || []).concat(element));
        }
        return callback();

      case "changeset":
        return this.processChangeset(element, callback);

      default:
        console.warn("Unrecognized type:", element.type);
        return callback();
    }
  }

  updateChangesetWithElement(element) {
    const changeset = cache.get(`changeset:${element.changeset}`);

    switch(element.type) {
      case "node":
        changeset.stats.nodes++;
        break;

      case "way":
        changeset.stats.ways++;
        break;

      case "relation":
        changeset.stats.relations++;
        break;

      default:
    }

    cache.set(`changeset:${changeset.id}`, changeset);
    this.push(changeset);

    // console.log(changeset)
  }

  processChangeset(changeset, callback) {
    // TODO remap users if necessary
    // TODO track edits by editor type
    const {
      id,
      open,
      tags: { comment, created_by, locale, source },
      uid,
      user
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
      hashtags = Array.from(
        new Set(
          comment.match(
            /(#[^\u2000-\u206F\u2E00-\u2E7F\s\\'!"#$%()*,./:;<=>?@[\]^`{|}~]+)/g
          )
        )
      );
    } else {
      hashtags = [];
    }

    if (imagery_used != null) {
      imagery_used = imagery_used.split(";").map(x => x.trim());
    }

    if (!this.isChangesetInteresting(changeset, hashtags)) {
      // clear out cached items associated with this changeset; not needed since
      // we don't care about it
      cache.del(key);
      return callback();
    }

    this.watchList.add(id);

    hashtags = hashtags.map(x => x.toLowerCase());

    // console.log(
    //   "\nchangeset id: %s (%s) - %s",
    //   id,
    //   open ? "open" : "closed",
    //   created_by,
    //   locale ? `(${locale})` : "",
    //   imagery_used || "",
    //   source || ""
    // );
    // console.log(hashtags.join(", "));

    let stats = {
      nodes: 0,
      ways: 0,
      relations: 0
    };

    // TODO find elements associated with this changeset
    const elements = cache.get(key);

    if (elements != null) {
      const nodes = elements.filter(x => x.type === "node");
      const ways = elements.filter(x => x.type === "way");
      const relations = elements.filter(x => x.type === "relation");

      // console.log("%d nodes", nodes.length);
      // console.log("%d ways", ways.length);
      // console.log("%d relations", relations.length);
      stats.nodes = nodes.length;
      stats.ways = ways.length;
      stats.relations = relations.length;

      const buildingWays = ways
        .map(
          x =>
            Object.keys(x.tags || {}).filter(tag =>
              TAGS_OF_INTEREST.includes(tag)
            ).length
        )
        .reduce((total, x) => total + x, 0);

      const newBuildings = ways
        // TODO or x.action === "create"
        .filter(x => x.version === 1)
        .map(
          x =>
            Object.keys(x.tags || {}).filter(tag =>
              TAGS_OF_INTEREST.includes(tag)
            ).length
        )
        .reduce((total, x) => total + x, 0);

      const modifiedBuildings = ways
        .filter(x => x.version > 1 && x.action !== "delete")
        .map(
          x =>
            Object.keys(x.tags || {}).filter(tag =>
              TAGS_OF_INTEREST.includes(tag)
            ).length
        )
        .reduce((total, x) => total + x, 0);

      // TODO way complexity (average nd.length)

      // console.log("building ways:", buildingWays);
      // console.log("new buildings:", newBuildings);
      // console.log("modified buildings:", modifiedBuildings);

      stats.buildings_added = newBuildings;
      stats.buildings_modified = modifiedBuildings;

      // clean up

      // clear out elements that were being held for us
      cache.del(key);

      // set a timer to remove this changeset 5 min after it's closed to give us 5 minutes to pick up stragglers
      // TODO work in sequence numbers, not minutes
      if (!open) {
        setTimeout(() => {
          console.log("Unwatching", id);
          this.watchList.delete(id);
        }, 5 * 60 * 1000);
      }
    }

    // console.log(changeset)

    // emit what we know about this changeset
    // TODO push a fuller representation
    this.push({
      hashtags,
      id,
      open,
      stats
    });
    cache.set(`changeset:${id}`, {
      closed_at,
      created_at,
      hashtags,
      id,
      open,
      stats,
      uid,
      user
    })

    return callback();
  }
};
