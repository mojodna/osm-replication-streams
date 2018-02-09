const _ = require("highland");
const axios = require("axios");
const yaml = require("js-yaml");

const OVERPASS_URL = "http://overpass-api.de";

const getMostRecentReplicationSequence = async ({ baseURL }) => {
  const rsp = await axios.get(`${baseURL}/api/augmented_diff_status`);

  return parseInt(rsp.data, 10);
};

async function getChange(sequence, { baseURL }) {
  const rsp = await axios.get(`${baseURL}/api/augmented_diff?id=${sequence}`, {
    responseType: "stream",
    timeout: 60e3
  });

  rsp.data.sequenceNumber = sequence;

  return rsp.data;
}

module.exports = options => {
  const opts = {
    baseURL: OVERPASS_URL,
    delay: 30e3,
    infinite: true,
    ...options
  };

  let state = opts.initialSequence;

  return _(async (push, next) => {
    try {
      const nextState = await getMostRecentReplicationSequence({
        baseURL: opts.baseURL
      });

      if (state == null || state < 0) {
        try {
          if (state < 0) {
            state += nextState;
          } else {
            state = nextState;
          }
        } catch (err) {
          return push(err, _.nil);
        }
      }

      if (state <= nextState) {
        const change = await getChange(state, { baseURL: opts.baseURL });

        push(null, change);

        state++;

        next();
      } else {
        if (options.infinite) {
          return setTimeout(next, opts.delay);
        }

        return push(null, _.nil);
      }
    } catch (err) {
      // retry
      return setTimeout(next, opts.delay);
    }
  })
    .map(s => {
      const startMarker = yaml.dump({
        status: "start",
        sequenceNumber: s.sequenceNumber
      });

      const endMarker = yaml.dump({
        status: "end",
        sequenceNumber: s.sequenceNumber
      });

      return _([`<!--\n${startMarker}\n-->`])
        .concat(s)
        .append(`<!--\n${endMarker}\n-->`)
        .append("\u001e");
    })
    .sequence();
};
