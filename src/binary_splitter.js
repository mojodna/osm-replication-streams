const { Transform } = require("stream");

const buffertools = require("buffertools");

class BinarySplitter extends Transform {
  constructor(delimiter = "\n") {
    super();

    this.delimiter = delimiter;
    this.pending = Buffer.alloc(0);
  }

  _flush(callback) {
    if (this.pending.length > 0) {
      this.push(this.pending);
    }

    return callback();
  }

  _transform(chunk, encoding, callback) {
    const buffer = Buffer.concat([this.pending, chunk]);
    let offset = 0;

    while (offset < buffer.length) {
      const idx = buffertools.indexOf(buffer, this.delimiter, offset);

      if (idx < 0) {
        break;
      }

      this.push(buffer.slice(offset, idx + 1));
      offset = idx + 1;
    }

    this.pending = buffer.slice(offset);

    return callback();
  }
}

module.exports = BinarySplitter;
