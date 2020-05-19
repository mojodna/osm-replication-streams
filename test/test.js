/* eslint-disable func-names */
const fs = require("fs");

const { assert } = require("chai");
const highland = require("highland");
const { beforeEach, describe, it } = require("mocha");

const {
  parsers: { AugmentedDiffParser },
} = require("../src/index.js");
const expectations = require("./expectations");

describe("Parsers", function () {
  describe("adiff", function () {
    let stream;

    beforeEach(function () {
      const rs = fs.createReadStream("./test/data/adiff.xml");
      const parser = new AugmentedDiffParser();
      stream = rs.pipe(parser);
    });

    describe("count objects in stream", function () {
      it("should encounter all objects", async function () {
        const result = await highland(stream)
          .reduce(0, (a) => a + 1)
          .toPromise(Promise);
        return assert.strictEqual(result, 8);
      });

      it("should encounter the correct number of created objects", async function () {
        const result = await highland(stream)
          .where({ id: "create" })
          .reduce(0, (a) => a + 1)
          .toPromise(Promise);
        return assert.strictEqual(result, 2);
      });

      it("should encounter the correct number of modified objects", async function () {
        const result = await highland(stream)
          .where({ id: "modify" })
          .reduce(0, (a) => a + 1)
          .toPromise(Promise);
        return assert.strictEqual(result, 4);
      });

      it("should encounter the correct number of deleted objects", async function () {
        const result = await highland(stream)
          .where({ id: "delete" })
          .reduce(0, (a) => a + 1)
          .toPromise(Promise);
        return assert.strictEqual(result, 2);
      });
    });

    describe("verify object structure after parsing", function () {
      it("should generate a created node", async function () {
        const result = await highland(stream)
          .where({ id: "create" })
          .map((x) => x.features)
          .find((x) => x[0].properties.type === "node")
          .toPromise(Promise);
        return assert.deepEqual(result, [expectations.nodeCreated.new]);
      });

      it("should generate a modified node", async function () {
        const result = await highland(stream)
          .where({ id: "modify" })
          .map((x) => x.features)
          .find((x) => x[0].properties.type === "node")
          .toPromise(Promise);
        return assert.deepEqual(result, [
          expectations.nodeModified.old,
          expectations.nodeModified.new,
        ]);
      });

      it("should generate a deleted node", async function () {
        const result = await highland(stream)
          .where({ id: "delete" })
          .map((x) => x.features)
          .find((x) => x[0].properties.type === "node")
          .toPromise(Promise);
        return assert.deepEqual(result, [
          expectations.nodeDeleted.old,
          expectations.nodeDeleted.new,
        ]);
      });

      it("should generate a created way", async function () {
        const result = await highland(stream)
          .where({ id: "create" })
          .map((x) => x.features)
          .find((x) => x[0].properties.type === "way")
          .toPromise(Promise);
        return assert.deepEqual(result, [expectations.wayCreated.new]);
      });

      it("should generate a modified way", async function () {
        const result = await highland(stream)
          .where({ id: "modify" })
          .map((x) => x.features)
          .find((x) => x[0].properties.type === "way")
          .toPromise(Promise);
        return assert.deepEqual(result, [
          expectations.wayModified.old,
          expectations.wayModified.new,
        ]);
      });

      it("should generate a deleted way", async function () {
        const result = await highland(stream)
          .where({ id: "delete" })
          .map((x) => x.features)
          .find((x) => x[0].properties.type === "way")
          .toPromise(Promise);
        return assert.deepEqual(result, [
          expectations.wayDeleted.old,
          expectations.wayDeleted.new,
        ]);
      });
    });
  });
});
