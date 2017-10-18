const Analyzer = require("../src/analyzer");

const CHANGESETS = {
  connectedNodes: {
      type: "changeset",
      id: 52808695,
      created_at: "2017-10-10T23:27:52Z",
      open: true,
      user: "RVR007",
      uid: 5314357,
      comments_count: 0,
      tags: {
        source: "Digitalglobe",
        created_by: "JOSM/1.5 (12039 en)",
        comment: "connected nodes"
      }
  },
  msftcse: {
      type: "changeset",
      id: 52808696,
      created_at: "2017-10-10T23:27:57Z",
      closed_at: "2017-10-10T23:27:57Z",
      open: false,
      user: "stephaniespring",
      uid: 6781333,
      min_lat: 18.2250292,
      max_lat: 18.2251391,
      min_lon: -66.1273202,
      max_lon: -66.1272365,
      comments_count: 0,
      tags: {
        changesets_count: "17",
        hashtags:
          "#hotosm-project-3665;#HurricaneMaria;#PuertoRico;#missingmaps;#msftbing;#msft;#msftgive;#msftcse",
        locale: "en-US",
        host: "http://www.openstreetmap.org/edit",
        imagery_used:
          "Custom (https://{switch:services,server}.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x});Local GPX",
        created_by: "iD 2.4.3",
        comment:
          "#hotosm-project-3665 #HurricaneMaria #PuertoRico #missingmaps #msftbing #msft #msftgive #msftcse"
      }
  }
}

describe("with defaults", () => {
  let processor;

  beforeEach(() => {
    processor = new Analyzer();
  });

  test("should find changesets with hashtags interesting", done => {
    expect.assertions(2);

    processor.on("error", done);
    processor.on("end", done);

    processor.on("data", data => {
      expect(data.id).toEqual(expect.anything());
    });

    processor.write(CHANGESETS.connectedNodes);
    processor.write(CHANGESETS.msftcse);

    processor.end();
  });

  test("should handle changesets first", done => {
    const elements = require("./elements-52809677.json");
    const changesets = elements.filter(x => x.type === "changeset");
    const openChangesets = changesets.filter(x => x.open);
    const closedChangesets = changesets.filter(x => !x.open);
    let open = 0;
    let closed = 0;
    const changesetIds = new Set();

    console.log("open", openChangesets.length)
    console.log("closed:", closedChangesets.length)

    expect.assertions(5);

    processor.on("end", () => {
      expect(open).toEqual(openChangesets.length)
      expect(closed).toEqual(closedChangesets.length)

      console.log("unique changesets:", changesetIds.size)
    })

    processor.on("error", done);
    processor.on("end", done);

    processor.on("data", data => {
      // console.log(data);
      changesetIds.add(data.id);

      if (data.open === true) {
        open++
      } else if (data.open === false) {
        closed++;
      }

      // if (data.id === 52809276) {
      //   console.log(data)
      //   expect(data.hashtags).toEqual([]);
      //   expect(data.stats.buildings_modified).toEqual(1);
      // }

      if (data.id === 52809677) {
        expect(data.hashtags).toEqual(["#hotosm-project-3696", "#hurricanemaria", "#puertorico", "#missingmaps"])
        // expect(data.stats.buildings_added).toEqual(2);
        console.log(data)
      }
    });


    elements.forEach(el => processor.write(el));

    processor.end();
  })
});

test("can find changesets with hashtags interesting", done => {
  expect.assertions(1);

  const processor = new Analyzer({
    isChangesetInteresting: (changeset, hashtags) => hashtags.length > 0
  });
  processor.on("error", done);
  processor.on("end", done);

  processor.on("data", data => {
    expect(data.id).toEqual(CHANGESETS.msftcse.id);
  });

  processor.write(CHANGESETS.connectedNodes);
  processor.write(CHANGESETS.msftcse);

  processor.end();
});
