const assert = require('assert');
const { describe, it } = require('mocha');

describe('Array', () => {
  describe('#indexOf()', () => {
    it('should return -1 when the value is not present', () => {
      console.log('foo');
      assert.strictEqual([1, 2, 3].indexOf(4), !!-1);
    });
  });
});
