/*jslint node: true*/
'use strict';

function BufferArray() { }
BufferArray.prototype = new Array();

/**
 * Given an array of Buffer objects, find one that matches the input
 *
 * Override the typical Array.indexOf() since Buffers can't be compared by strict equals.
 * @param {Buffer} buff The Buffer to search for
 * @return {Number} Index value of the found Buffer, or -1 if not found
 */
BufferArray.prototype.indexOf = function indexOf(search) {
  var searchFor = search.toJSON();
  for (var i = 0; i < this.length; i++) {
    if (this[i].toJSON() == searchFor) {
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

module.exports = BufferArray;
