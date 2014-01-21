"use strict";
var leveldown = require('leveldown');
var async = require('async');

var Storage = exports.Storage = function Storage(uri, callback) {
  var defaultCreateOpts = {
    createIfMissing: true,
  };
  
  var self = this;
  console.log('Initializing LevelDB');
  async.waterfall([
    function(cb) {
      self.handle = leveldown(uri);
      self.handle.open(defaultCreateOpts, cb);
    },
    function(cb) {
      cb(null, 'LevelDB created at '+uri);
    }
  ], callback);
};