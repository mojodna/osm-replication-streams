const { Transform } = require("stream");

const { lineString, point, polygon } = require("@turf/helpers");
const async = require("async");
const { isArea } = require("id-area-keys");
const OSMParser = require("osm2obj");
const redis = require("redis");
const request = require("request");

const client = redis.createClient();

const parser = new OSMParser({
  coerceIds: true
});

// level 2 cache
// TODO redis

// level 3 "cache"
// TODO fetch elements from OSM

// 1. write a batch of changes

// find all ways associated with nodes present in the batch

// 2. get back geometry edits for them

// drop nodes and ways without tags

const getNode = (id, callback) => {
  const key = `node:${id}`;

  return client.get(key, (err, reply) => {
    if (err == null && reply != null) {
      const element = JSON.parse(reply);

      return callback(null, element);
    }

    // TODO coalesce requests
    return request(`http://www.openstreetmap.org/api/0.6/node/${id}`, (err, rsp, body) => {
      if (err) {
        return callback(err);
      }

      const element = parser.parse(body).pop();
      client.set(key, JSON.stringify(element), err => err && console.warn(err));

      return callback(null, element);
    })
  })
};

const getReferringWays = (nodeId, callback) => {
  const key = `waysFor:${nodeId}`;

  return client.get(key, (err, reply) => {
    if (err == null && reply != null) {
      const ways = JSON.parse(reply);

      return callback(null, ways);
    }

    // TODO coalesce requests
    return request(`http://www.openstreetmap.org/api/0.6/node/${nodeId}/ways`, (err, rsp, body) => {
      if (err) {
        return callback(err);
      }

      const fullWays = parser.parse(body);

      fullWays.forEach(element => {
        const ek = `${element.type}:${element.id}`;
        client.set(ek, JSON.stringify(element), err => err && console.warn(err));
      })

      const ways = fullWays.map(w => w.id);
      client.set(key, JSON.stringify(ways), err => err && console.warn(err));

      return callback(null, ways);
    })
  })
};

const updateReferringWays = (wayId, nodeIds, callback) => {
  return async.each(nodeIds, (nodeId, done) => {
    return getReferringWays(nodeId, (err, ways) => {
      if (err) {
        return done(err);
      }

      if (!ways.includes(wayId)) {
        const k = `waysFor:${nodeId}`;
        const wayIds = ways.concat(wayId);
        client.set(k, JSON.stringify(wayIds), err => err && console.warn(err));
      }

      return done();
    });
  }, callback);
}

module.exports = class Assembler extends Transform {
  constructor() {
    super({
      objectMode: true
    });

    this.batch = [];
    this.currentTimestamp = 0;
  }

  _transform(element, _, callback) {
    // this has been updated in newer Kinesis events
    if (element.action === "delete") {
      element.visible = false;
    } else {
      element.visible = true;
    }

    const timestamp = Date.parse(element.timestamp);

    if (this.currentTimestamp < timestamp) {
      console.log("TICK");
      return this.processBatch(err => {
        if (err) {
          // TODO if this is a consistent error, time will never tick forward
          return callback(err);
        }

        this.resetBatch();

        this.currentTimestamp = timestamp;
        this.addToBatch(element);

        return callback();
      });
    }

    this.addToBatch(element);

    return callback();

    // this.processElement(element, callback);
  }

  addToBatch(element) {
    this.batch.push(element);
  }

  resetBatch() {
    this.batch = [];
  }

  processBatch(callback) {
    console.log(this.batch.length);

    if (this.batch.length === 0) {
      return callback();
    }

    const nodes = this.batch.filter(x => x.type === "node");

    const nodeIds = Array.from(new Set(nodes.map(x => x.id)));

    // find ways referring to nodes present in this batch
    if (nodes.length > 0) {
      const query = `
        [out:json][date:"${new Date(this.currentTimestamp - 1).toISOString()}"];
        (node(id:${nodeIds.join(",")}); <);
        out meta;
      `;

      return request.post({
        uri: "https://overpass-api.de/api/interpreter",
        form: {
          data: query
        },
        json: true
      }, (err, rsp, body) => {
        if (err) {
          console.warn(err.stack);
          return callback(err);
        }

        // console.log("OSM timestamp:", body.osm3s.timestamp_osm_base);

        console.log(body)

        const ways = body.elements.filter(x => x.type === "way");

        ways.forEach(w => {
          client.set(`${w.type}:${w.id}`, JSON.stringify(w), err => err && console.warn(err));
          w.nodes.forEach(n => {
            client.sadd(`waysFor:${n}`, w.id, err => err && console.warn(err));
          })
        });

        const nodes = body.elements.filter(x => x.type === "node");

        nodes.forEach(n => {
          client.set(`${n.type}:${n.id}`, JSON.stringify(n), err => err && console.warn(err));
        })

        // console.log(ways);
        console.log(nodes)

        return callback();
      });
    }

    // https://overpass-api.de/api/interpreter
    // data=query

    // console.log("nodeIds", nodeIds)

    // console.log(this.batch.filter(x => x.visible))

    return callback();
  }

  processElement(element, callback) {
    // check timestamps; every time the timestamp changes, process a batch


    switch (element.type) {
      case "node":
        return this.processNode(element, callback);

      case "way":
        return this.processWay(element, callback);

      case "relation":
      case "changeset":
        return callback();

      default:
        console.warn("Unrecognized type:", element.type);
        return callback();
    }
  }

  processNode(element, callback) {
    const key = `${element.type}:${element.id}`;
    client.set(key, JSON.stringify(element), err => err && console.warn(err));

    // TODO assert element.lat, element.lon

    if (element.tags != null && Object.keys(element.tags).length > 0) {
      const f = point([element.lon, element.lat], {
        changeset: element.changeset,
        id: element.id,
        tags: element.tags,
        timestamp: element.timestamp,
        uid: element.uid,
        user: element.user,
        version: element.version
      }, {
        id: element.id
      })

      this.push(f);
    }

    // TODO find ways that this node is part of
    return getReferringWays(element.id, (err, ways) => {
      if (err) {
        return callback(err);
      }

      console.log("referring ways:", ways);

      // TODO load and process each referring way element

      return callback();
    });
  }

  processWay(element, callback) {
    // console.log(element);

    if (element.tags == null || Object.keys(element.tags).length === 0) {
      // untagged way; presumably part of a relation
      // TODO or a deletion
      return callback();
    }

    const key = `${element.type}:${element.id}`;
    client.set(key, JSON.stringify(element), err => err && console.warn(err));

    // cache referenced nodes
    return updateReferringWays(element.id, element.nodes, err => {
      return async.map(element.nodes || [], getNode, (err, nodes) => {
        if (err) {
          console.warn(err);
          return callback(err);
        }

        let f;

        if (isArea(element.tags)) {
          f = polygon([nodes.map(n => [n.lon, n.lat])], {
            changeset: element.changeset,
            id: element.id,
            tags: element.tags,
            timestamp: element.timestamp,
            uid: element.uid,
            user: element.user,
            version: element.version
          }, {
            id: element.id
          });
        } else {
          f = lineString(nodes.map(n => [n.lon, n.lat]), {
            changeset: element.changeset,
            id: element.id,
            tags: element.tags,
            timestamp: element.timestamp,
            uid: element.uid,
            user: element.user,
            version: element.version
          }, {
            id: element.id
          });
        }

        this.push(f);

        return callback();
      });
    });
  }
};
