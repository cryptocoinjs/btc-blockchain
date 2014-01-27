"use strict";
var Storage = require('./Storage').Storage;
var sha256 = require('crypto-hashing').sha256;
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
    function(cb) { // Create data directory
      fs.mkdir(self.options.dataDir, function(err) {
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
      self.db = new Storage(self.options.dataDir+'/blockchain.db', cb);
    }
  ], callback);
};

BTCBlockchain.prototype.getDataDir = function getDataDir() {
  // TODO: Support non POSIX OSes
  return process.env.HOME + "/.cryptocoinjs";
};


BTCBlockchain.prototype.addBlock = function addBlock(block, callback) {
  // Validate the block, and add to chain
  async.waterfall([
    function(cb) { // Do basic checks
      var rs = block.validate();
      if (rs !== true) {
        var e = new Error('Block failed internal validation');
        e.inner = rs;
        cb(e);
        return;
      }
      if (block.transactions.length == 0) {
        cb(new Error('Block has no transactions (not even a coinbase)'));
        return;
      }
      if (block.transactions[0].isCoinbase() === false) {
        cb(new Error('First transaction is not coinbase'));
        return;
      }
      if (block.timestamp.getTime() > new Date().getTime() + 2*60*60) {
        cb(new Error('Block timestamp is too far in the future'));
        return;
      }
      var hashes = [];
      for (var i = 0; i < block.transactions.length; i++) {
        rs = block.transactions[i].validate();
        if (rs !== true) {
          var e = new Error('Transaction '+i+' failed internal validation');
          e.inner = rs;
          cb(e);
          return;
        }
        hashes.push(block.transactions[i].getHash());
      }
      
      // Verify Merkle hash tree
      if (hashes.length % 2 !== 0) {
        // Odd-length base; duplicate last hash
        hashes.push(hashes[hashes.length-1]);
      }
      while (hashes.length > 1) {
        var nextRow = [];
        for (var i = 0; i < hashes.length; i += 2) {
          nextRow.push(sha256.x2(Buffer.concat([hashes[i], hashes[i+1]], 64)));
        }
        if (nextRow.length % 2 !== 0) {
          nextRow.push(nextRow[nextRow.length-1]);
        }
        hashes = nextRow;
      }
      if (hashes[0] !== block.merkle_root) {
        cb(new Error('Merkle root does not validate'));
        return;
      }
      
      self.db.blockExists(block.hash, cb);
    },
    function(rs, cb) { // See if block already exists
      if (rs === true) {
        cb(new Error('Block already exists in chain'));
        return;
      }
      cb(null, 'Block added'); // Done
    }
  ], callback);
};