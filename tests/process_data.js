const fs = require("fs")
const path = require("path")

const elements = require("./data.json");

const nodes = elements.filter(x => x.type === "node");
const ways = elements.filter(x => x.type === "way");
const relations = elements.filter(x => x.type === "relation");
const changesets = elements.filter(x => x.type === "changeset").map(changeset => ({
  ...changeset,
  nodes: nodes.filter(node => node.changeset === changeset.id),
  ways: ways.filter(way => way.changeset === changeset.id),
  relations: relations.filter(relation => relation.changeset === changeset.id)
}));

const empty = changesets.filter(x => x.nodes.length === 0 && x.ways.length === 0 && x.relations.length === 0)
const candidates = changesets.filter(x => x.nodes.length > 0 || x.ways.length > 0 || x.relations.length > 0)

console.log("%d empty changesets", empty.length)
console.log("%d candidates", candidates.length)

const candidate = candidates[Math.round(candidates.length / 2)]
console.log(candidate.id, candidate.nodes.length, candidate.ways.length, candidate.relations.length)

const streamContents = elements.filter(x => x.changeset === candidate.id || (x.id === candidate.id && x.type === "changeset"))

fs.writeFileSync(path.join(__dirname, "/elements.json"), JSON.stringify(streamContents))
