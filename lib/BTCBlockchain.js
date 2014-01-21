"use strict";
var Storage = require('./Storage').Storage;
var async = require('async');
var fs = require('fs');

var BTCBlockchain = exports.BTCBlockchain = function(options) {
  options = (typeof options === 'undefined')? {} : options;
  var defaultOpts = {
    dataDir: this.getDataDir()
  };
  for (var name in defaultOpts) {
    if (defaultOpts.hasOwnProperty(name) && !options.hasOwnProperty(name)) {
      options[name] = defaultOpts[name];
    }
  }
  this.options = options;
};

BTCBlockchain.prototype.launch = function launch(callback) {
  var self = this;
  async.waterfall([
    function(cb) {
      fs.mkdir(self.options.dataDir, function(err) {
        cb(null, err); // Bypass async's error-handling for this one
      });
    },
    function(err, cb) {
      if (err) {
        if (err.code !== 'EEXIST') {
          cb(err); // If it's something other than a "directory already exists" error, throw it
          return;
        }
      }
      cb(null);
    },
    function(cb) {
      self.db = new Storage(self.options.dataDir+'/blockchain.db', cb);
    }
  ], callback);
};


BTCBlockchain.prototype.getDataDir = function getDataDir() {
  // TODO: Support non POSIX OSes
  return process.env.HOME + "/.cryptocoinjs";
};
