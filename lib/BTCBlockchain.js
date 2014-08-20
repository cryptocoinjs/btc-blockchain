"use strict";
var Storage = require('./Storage').Storage;
var sha256 = require('crypto-hashing').sha256;
var async = require('async');
var events = require('events');
var fs = require('fs');
var util = require('util');

var BTCBlockchain = exports.BTCBlockchain = function BTCBlockchain(options) {
  events.EventEmitter.call(this);
  options = (typeof options === 'undefined')? {} : options;
  this.options = options;
};
util.inherits(BTCBlockchain, events.EventEmitter);

BTCBlockchain.prototype.launch = function launch(callback) {
  var self = this;
  async.waterfall([
    function(cb) { // Create data directory
      fs.mkdir(self.getDataDir(), function(err) {
        cb(null, err); // Bypass async's error-handling for this one
      });
    },
    function(err, cb) { // Analyze result of data directory creation
      if (err) {
        if (err.code !== 'EEXIST') {
          cb(err); // If it's something other than a "directory already exists" error, throw it
          return;
        }
      }
      cb(null);
    },
    function(cb) { // Create new database store
      self.db = new Storage(self.getDataDir()+'/blockchain.db', cb);
    },
    function(cb) {
      self.emit('launched');
      cb(null);
    }
  ], callback);
};

BTCBlockchain.prototype.getDataDir = function getDataDir() {
  // TODO: Support non POSIX OSes
  if (typeof this.options.dataDir !== 'undefined') return this.options.dataDir;
  return process.env.HOME + "/.cryptocoinjs";
};


BTCBlockchain.prototype.addBlock = function addBlock(hash, parent, block, callback) {
  var self = this;
  var blockHeight = 0;
  async.waterfall([
    function(cb) { // Check for existing
      self.db.blockExists(hash, cb);
    },
    function(rs, cb) { // See if block already exists
      if (rs === true) {
        cb(new Error('Block already exists in chain'));
        return;
      }

      // Figure out the height of this block
      // First find the parent of the block
      self.db.read(parent, cb);
    },
    function (rs, cb) {
      if (rs === false) {
        // If parent lookup returned false, no known parent, so start new chain
        blockHeight = 0;
        // TODO: Add block to list of ROOTS
      } else {
        blockHeight = rs.height+1;
      }

      // TODO: search the list of ROOTS for blocks that were waiting for this as their parent
      // TODO: determine if this block is a TIP or not

      self.db.create(hash, block, blockHeight, cb);
    },
    function (blockData, cb) {
      var isRoot = (blockHeight == 0)? true : false;
      var isTip = true; // TODO: Look this block up in the list of TIPS
      self.emit('blockAdded', {
        hash: blockData.key,
        data: blockData.data,
        height: blockData.height,
        isRoot: isRoot,
        isTip: isTip
      });
      cb(null); // Done
    }
  ], callback);
};

BTCBlockchain.prototype.getBlock = function(hash, callback) {
  this.db.read(hash, callback);
};

BTCBlockchain.prototype.updateBlock = function addBlock(block) {

};

BTCBlockchain.prototype.deleteBlock = function addBlock(block, andChildren) {

};

BTCBlockchain.prototype.purge = function(callback) {
  this.db.deleteAll(callback);
};
