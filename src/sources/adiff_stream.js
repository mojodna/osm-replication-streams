const _ = require("highland");
const axios = require("axios");

const OVERPASS_URL = "http://overpass-api.de";


const getMostRecentReplicationSequence = async ({ baseURL }) => {
  const rsp = await axios.get(`${baseURL}/api/augmented_diff_status`)

  return parseInt(rsp.data, 10);
};

async function getChange(sequence, { baseURL }) {
  const rsp = await axios.get(`${baseURL}/api/augmented_diff?id=${sequence}`, {
    responseType: "stream"
  });

  rsp.data.sequenceNumber = sequence;

  return rsp.data;
}

module.exports = options => {
  const opts = {
    baseURL: OVERPASS_URL,
    checkpoint: () => {},
    delay: 30e3,
    infinite: true,
    ...options
  };

  let state = opts.initialSequence;

  return _(async (push, next) => {
    try {
      const nextState = await getMostRecentReplicationSequence({ baseURL: opts.baseURL });

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

        opts.checkpoint(state);

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
    .map(s => _(s).append(`<!-- sequenceNumber: ${s.sequenceNumber} -->\n`).append("\u001e"))
    .sequence();
};
