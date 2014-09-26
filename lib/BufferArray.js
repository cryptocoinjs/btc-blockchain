/*jslint node: true*/
'use strict';

function BufferArray() {
  this.length = 0;
}
BufferArray.prototype = new Array();

/**
 * Given an array of Buffer objects, find one that matches the input
 *
 * Override the typical Array.indexOf() since Buffers can't be compared by strict equals.
 * @param {Buffer} buff The Buffer to search for
 * @return {Number} Index value of the found Buffer, or -1 if not found
 */
BufferArray.prototype.indexOf = function indexOf(search) {
  var searchFor = search.toString('hex');
  for (var i = 0; i < this.length; i++) {
    if (this[i].toString('hex') == searchFor) {
      return i;
    }
  }
  return -1;
};

BufferArray.prototype.unique = function unique() {
  return this.reduce(function(output, elem) {
    if (output.indexOf(elem) < 0) output.push(elem);
    return output;
  }, new BufferArray());
};

BufferArray.prototype.toArray = function toArray() {
  var out = [];
  for (var i = 0; i < this.length; i++) {
    out.push(this[i]);
  }
  return out;
};

BufferArray.prototype.join = function join(glue, encoding) {
  glue = glue || ', ';
  encoding = encoding || 'hex';
  var out = [];
  for (var i = 0; i < this.length; i++) {
    out.push(this[i].toString(encoding));
  }
  return out.join(glue);
};

BufferArray.prototype.filter = function(fn) {
  var out = new BufferArray();
  for(var i = 0; i < this.length; i++) {
    if (fn(this[i], i) === true) {
      out.push(this[i]);
    }
  }
  return out;
};

module.exports = BufferArray;
