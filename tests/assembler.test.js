const Assembler = require("../src/assembler");

describe("with defaults", () => {
  let assembler;

  beforeEach(() => {
    assembler = new Assembler();
  });

  test("should handle changesets first", done => {
    // const elements = require("./elements-52809677.json");
    const elements = require("./data.json").slice(0, 443);
    // const elements = require("./data.json").slice(473, 474 + 39);
    // const elements = require("./data.json").slice(0, 2000);

    expect.assertions(0);

    assembler.on("end", () => {
      // expect(open).toEqual(openChangesets.length)
      // expect(closed).toEqual(closedChangesets.length)
      //
      // console.log("unique changesets:", changesetIds.size)
    })

    assembler.on("error", done);
    assembler.on("end", done);

    assembler.on("data", data => {
      console.log("%j", data);
    });


    elements.forEach(el => assembler.write(el));

    assembler.end();
  })
});
