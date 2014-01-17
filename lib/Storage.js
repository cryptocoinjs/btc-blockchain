var leveldown = require('leveldown');
var async = require('async');

var Storage = exports.Storage = function Storage(uri, callback) {
  var defaultCreateOpts = {
    createIfMissing: true,
  };
  
  var self = this;
  async.series([
    function(cb) {
      self.handle = leveldown(uri);
      self.handle.open(defaultCreateOpts, cb);
    }
  ], callback);
};