const { Transform } = require("stream");

const {
  featureCollection,
  lineString,
  point,
  polygon
} = require("@turf/helpers");
require("array-flat-polyfill");   // Remove when support dropped for Node < 11
const { Parser } = require("htmlparser2");
const { isArea } = require("id-area-keys");
const yaml = require("js-yaml");
const isEqual = require("lodash.isequal");

const isClosed = coords => isEqual(coords[0], coords[coords.length - 1]);

const toGeoJSON = (id, element, prev) => {
  let { tags } = element;
  const visible = element.visible !== "false";

  if (!visible) {
    ({ tags } = prev);
  }

  switch (element.type) {
    case "node": {
      let coords = [element.lon, element.lat];

      // use previous coords if the element has been deleted
      if (element.lat == null && element.lon == null) {
        coords = [prev.lon, prev.lat];
      }

      return point(
        coords,
        {
          changeset: element.changeset,
          id: element.id,
          tags,
          timestamp: element.timestamp,
          type: element.type,
          uid: element.uid,
          user: element.user,
          version: element.version,
          visible
        },
        {
          id
        }
      );
    }

    case "way": {
      let coords = element.nodes.map(x => [x.lon, x.lat]);

      if (element.nodes.length === 0) {
        coords = prev.nodes.map(x => [x.lon, x.lat]);
      }

      const nds = element.nodes.map(x => x.id || x.ref)

      const properties = {
        changeset: element.changeset,
        id: element.id,
        nds,
        tags,
        timestamp: element.timestamp,
        type: element.type,
        uid: element.uid,
        user: element.user,
        version: element.version,
        visible
      }

      if (coords.flat().some(x => x == null)) {
        // invalid geometry

        return {
          id,
          type: "Feature",
          geometry: {
            type: "GeometryCollection",
            geometries: []
          },
          properties
        };
      }

      if (
        isClosed(coords) &&
        isArea(element.tags) &&
        coords.length >= 4
      ) {
        return polygon([coords], properties, { id });
      }

      if (coords.length >= 2) {
        return lineString(coords, properties, { id });
      }

      return point(
        coords[0], properties, { id });
    }

    default:
  }
};

module.exports = class AugmentedDiffParser extends Transform {
  constructor() {
    super({
      readableObjectMode: true
    });

    this.sequence = null;
    this.timestamp = null;

    this.createParser();
  }

  createParser() {
    this.parser = new Parser(
      {
        onopentag: this.startElement.bind(this),
        onclosetag: this.endElement.bind(this),
        oncomment: comment => {
          try {
            const data = yaml.safeLoad(comment);

            if (data.status === "start") {
              this.sequence = data.sequenceNumber;
              // Overpass sequences are minute offsets from 2012-09-12T06:55:00.000Z
              this.timestamp = new Date(
                (this.sequence * 60 + 1347432900) * 1000
              );
              this.emit("sequenceStart", this.sequence);
            }

            if (data.status === "end") {
              this.emit("sequenceEnd", this.sequence);
              this.parser.reset();
              this.sequence = null;
              this.timestamp = null;
            }

            // push a marker into the stream
            this.push({
              type: "Marker",
              properties: data
            });
          } catch (err) {
            // not yaml
          }
        },
        onerror: err => console.warn(err) && this.emit("error", err)
      },
      {
        xmlMode: true
      }
    );

    // write a synthetic root element to facilitate parsing of multiple
    // documents
    this.parser.write("<root>");
  }

  _transform(chunk, encoding, callback) {
    this.parser.write(chunk);

    return callback();
  }

  startElement(name, attributes) {
    switch (name) {
      case "osm":
        this.nodes = {
          old: {},
          new: {}
        };
        this.ways = {
          old: {},
          new: {}
        };
        this.relations = {
          old: {},
          new: {}
        };
        this.nds = {};

        break;

      case "action":
        this.action = attributes.type;

        if (this.action === "create") {
          this.state = "new";
        }

        break;

      case "old":
      case "new":
        this.state = name;
        break;

      case "node": {
        const { lat, lon } = attributes;

        this[this.state] = {
          ...attributes,
          lat: lat ? Number(lat) : null,
          lon: lon ? Number(lon) : null,
          tags: {},
          type: name
        };

        break;
      }

      case "way":
        this[this.state] = {
          ...attributes,
          nodes: [],
          tags: {},
          type: name
        };

        break;

      case "relation":
        this[this.state] = {
          ...attributes,
          members: [],
          tags: {},
          type: name
        };

        break;

      case "tag":
        this[this.state].tags = {
          ...this[this.state].tags,
          [attributes.k]: attributes.v
        };

        break;

      case "nd": {
        const element = this[this.state];

        switch (element.type) {
          case "way": {
            const { ref, lat, lon } = attributes;

            const nd = {
              ref,
              lat: lat ? Number(lat) : null,
              lon: lon ? Number(lon) : null
            };

            element.nodes = [...element.nodes, nd];

            break;
          }

          default:
        }

        break;
      }

      default:
    }
  }

  endElement(name) {
    switch (name) {
      case "action": {
        // cache elements for lookups when reconstructing ways + relations
        // (duplicates old/new endElement because creates don't fire them)
        const element = this[this.state];
        this[`${element.type}s`][this.state][element.id] = this[this.state];

        const { old: prev, new: next } = this;

        // no support for relations yet
        if (["node", "way"].includes(next.type)) {
          if (prev == null) {
            try {
              const ng = toGeoJSON("new", next);
              if (this.sequence != null) {
                ng.properties.augmentedDiff = this.sequence;
              }

              this.push(
                featureCollection([ng], {
                  id: this.action
                })
              );
            } catch (err) {
              console.warn(err.stack);
            }
          } else {
            if (
              prev.version === next.version ||
              Date.parse(next.timestamp) < this.timestamp - 60e3
            ) {
              // node 35989826 was modified, changing way 5187240, which should show as version 3 before and after
              // http://overpass-api.de/api/augmented_diff?id=2853595
              this.action = "minorVersion";

              // prev.changeset is the last *major* version
              // next.changeset is the current *major* version
              if (next.type === "way") {
                const nodeMeta = next.nodes
                  // filter out nodes not included in this diff
                  .filter(x => x.timestamp)
                  .sort(
                    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
                  );

                if (nodeMeta.length === 0) {
                  // see way 17641595 (version 2 -> 3) in
                  // http://overpass-api.de/api/augmented_diff?id=2801986
                  // tags change but the new way doesn't reflect the new version
                  return;
                }

                // assign the correct metadata
                const meta = nodeMeta.pop();

                next.changeset = meta.changeset;
                next.uid = meta.uid;
                next.user = meta.user;
                next.timestamp = meta.timestamp;
              }
            }

            try {
              const og = toGeoJSON("old", prev);
              const ng = toGeoJSON("new", next, prev);
              if (this.sequence != null) {
                ng.properties.augmentedDiff = this.sequence;
              }

              this.push(
                featureCollection([og, ng], {
                  id: this.action
                })
              );
            } catch (err) {
              console.warn(err.stack);
            }
          }
        }

        this.state = null;
        this.old = null;
        this.new = null;

        break;
      }

      case "old":
      case "new": {
        // cache elements for lookups when reconstructing ways + relations
        const element = this[this.state];
        this[`${element.type}s`][this.state][element.id] = this[this.state];
        break;
      }

      case "way": {
        const element = this[this.state];

        element.nodes = element.nodes.map(n => {
          let node = this.nodes[this.state][n.ref] || n;

          // if the node was deleted, use the old version so we have geometry
          // information
          if (this.state === "new" && node.visible === "false") {
            node = this.nodes.old[n.ref] || n;
          }

          return node;
        });

        break;
      }

      default:
    }
  }
};
