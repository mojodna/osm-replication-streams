const { Transform } = require("stream");

const {
  featureCollection,
  lineString,
  point,
  polygon
} = require("@turf/helpers");
const { isArea } = require("id-area-keys");
const isEqual = require("lodash.isequal");
const sax = require("sax");

const isClosed = coords => isEqual(coords[0], coords[coords.length - 1]);

module.exports = class AugmentedDiffParser extends Transform {
  constructor() {
    super({
      readableObjectMode: true
    });

    this.batch = [];
    this.currentTimestamp = 0;

    this.createParser();
  }

  createParser() {
    this.parser = sax.createStream(false, {
      lowercase: true
    });
    this.parser.on("opentag", this.startElement.bind(this));
    this.parser.on("closetag", this.endElement.bind(this));
    this.parser.on("error", err => {
      this.emit("error", err);
    });

    // write a synthetic root element to facilitate parsing of multiple documents
    this.parser.write("<root>");
  }

  _transform(chunk, encoding, callback) {
    this.parser.write(chunk);

    return callback();
  }

  startElement({ name, attributes }) {
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

            element.nodes = [
              ...element.nodes,
              {
                ref,
                lat: Number(lat),
                lon: Number(lon)
              }
            ];

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
            if (Object.keys(next.tags).length > 0) {
              const ng = this.toGeoJSON("new", next);

              this.push(
                featureCollection([ng], {
                  id: this.action
                })
              );
            }
          } else {
            if (prev.version === next.version) {
              this.action = "minorVersion";

              // prev.changeset is the last *major* version

              if (next.type === "way") {
                const changesets = next.nodes
                  // filter out nodes not included in this diff
                  .filter(x => x.timestamp)
                  .sort(
                    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
                  )
                  .map(x => x.changeset);

                if (changesets.length === 0) {
                  // see way 17641595 (version 2 -> 3) in
                  // http://overpass-api.de/api/augmented_diff?id=2801986
                  // tags change but the new way doesn't reflect the new version
                  return;
                }

                // attribute this to the correct changeset
                next.changeset = changesets.pop();
              }
            }

            if (
              Object.keys(prev.tags).length > 0 ||
              Object.keys(next.tags).length > 0
            ) {
              const og = this.toGeoJSON("old", prev);
              const ng = this.toGeoJSON("new", next, prev);

              this.push(
                featureCollection([og, ng], {
                  id: this.action
                })
              );
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

        if (element.nodes.length > 0) {
          element.nodes = element.nodes.map(
            n => this.nodes[this.state][n.ref] || n
          );
        }

        break;
      }

      default:
    }
  }

  toGeoJSON(id, element, prev) {
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
            tags: element.tags,
            timestamp: element.timestamp,
            uid: element.uid,
            user: element.user,
            version: element.version
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

        if (isClosed(coords) && isArea(element.tags) && coords.length >= 4) {
          return polygon(
            [coords],
            {
              changeset: element.changeset,
              id: element.id,
              tags: element.tags,
              timestamp: element.timestamp,
              uid: element.uid,
              user: element.user,
              version: element.version
            },
            {
              id
            }
          );
        }

        return lineString(
          coords,
          {
            changeset: element.changeset,
            id: element.id,
            tags: element.tags,
            timestamp: element.timestamp,
            uid: element.uid,
            user: element.user,
            version: element.version
          },
          {
            id
          }
        );
      }

      default:
    }
  }
};
