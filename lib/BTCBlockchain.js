/*jslint node: true */
'use strict';
var Storage = require('./Storage');
var sha256 = require('crypto-hashing').sha256;
var async = require('async');
var events = require('events');
var fs = require('fs');
var util = require('util');

var BTCBlockchain = module.exports = function BTCBlockchain(options) {
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
        if (err.code === 'EEXIST') {
          err = null; // Override a "file already exists" error
        }
        cb(err);
      });
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

var addBlockProcessing = false;
BTCBlockchain.prototype.addBlock = function addBlock(hash, parent, block, callback) {
  if (addBlockProcessing) {
    callback(new Error('Another block is already processing; wait for callback before adding!!'));
    return;
  }
  addBlockProcessing = true;
  var self = this;
  var blockHeight = 0;
  var children = [];
  async.waterfall([
    function(cb) { // Validation checks
      if (!Buffer.isBuffer(hash)) {
        cb(new Error('Hash must be a 32-byte Buffer'));
        return;
      } else if (!Buffer.isBuffer(parent)) {
        cb(new Error('Parent must be a 32-byte Buffer'));
        return;
      } else if (!Buffer.isBuffer(block)) {
        cb(new Error('Block data must be a Buffer'));
        return;
      } else if (hash.length !== 32) {
        cb(new Error('Hash must be 32 bytes long (passed as '+hash.length+')'));
        return;
      } else if (parent.length !== 32) {
        cb(new Error('Parent must be 32 bytes long (passed as '+parent.length+')'));
        return;
      } else if (hash.toString('hex') == parent.toString('hex')) {
        cb(new Error('Block cannot be its own child'));
        return;
      }

      cb(null); // Validation passed
    },
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
        cb(null);
        return;
      }

      // Otherwise, we do have a known parent; update accordingly
      blockHeight = rs.height+1;

      // Remove parent from list of Tips
      self._delTip(parent, function(err) {
        if (err !== null) {
          cb(err);
          return;
        }
        // Add this block to the list of children for the parent
        rs.children.push(hash);
        self.db.update(parent, {children: rs.children}, function(err, block) {
          if (err !== null) {
            cb(err);
          } else {
            cb(null);
          }
        });
      });
    },
    function(cb) { //search the list of ROOTS for blocks that were waiting for this as their parent
      self.db.getRoots(function(roots) {
        async.each(roots, function(rootHash, cbEach) {
          self.db.read(rootHash, function(err, otherBlock) {
            if (otherBlock.parent.toString('hex') == hash.toString('hex')) {
              // rootHash is a child of the added block
              children.push(rootHash);
            }
            cbEach(null);
          });
        }, function(err) {
          cb(null, children);
        });
      });
    },
    function(children, cb) { // Update all children to have new heights
      async.each(children, function(childHash, cbEach) {
        self.db.updateHeight(childHash, blockHeight+1, function(err) {
          if (err !== null) {
            cbEach(err);
            return;
          }
          self._delRoot(childHash, cbEach); // Remove child from list of Roots
        });
      }, cb);
    },
    function(cb) { // Add to list of Roots, if applicable
      if (blockHeight > 0) {
        cb(null);
        return;
      }
      self._addRoot(hash, cb);
    },
    function(cb) { // Add to list of Tips, if applicable
      if (children.length > 0) {
        // Not a tip; skipping
        cb(null);
        return;
      }
      self._addTip(hash, cb);
    },
    function(cb) { // Add this block to the database
      self.db.create(hash, {
        data:block,
        parent:parent,
        height:blockHeight,
        children:children
      }, cb);
    },
    function (blockData, cb) {
      var isRoot = (blockHeight === 0)? true : false;
      var isTip = (children.length === 0)? true : false;
      self.emit('blockAdded', {
        hash: blockData.hash,
        data: blockData.data.data,
        parent: blockData.data.parent,
        height: blockData.data.height,
        isRoot: isRoot,
        isTip: isTip
      });
      addBlockProcessing = false;
      cb(null); // Done
    }
  ], callback);
};

/**
 * Add several blocks to the chain at once
 * @param {Array[Object]}    blocks   Array of objects, each object must have a 'hash', 'parent', and 'data' property
 * @param {Function} callback Function to be called when complete
 */
BTCBlockchain.prototype.addBlocks = function(blocks, callback) {
  var self = this;
  async.eachSeries(blocks, function(block, cb) {
    self.addBlock(block.hash, block.parent, block.data, cb);
  }, callback);
};

/**
 * Get a single block from the database
 * @param {Buffer} hash Key of the block to look up
 * @param {Function} callback Function to be called when complete
 */
BTCBlockchain.prototype.getBlock = function(hash, callback) {
  this.db.read(hash, callback);
};

BTCBlockchain.prototype.getBlocks = function(hashes, callback) {
  var self = this;
  async.parallel(hashes, function(hash, cb) {
    self.getBlock(hash, cb);
  }, callback);
};

var deleteBlockProcessing = false;
BTCBlockchain.prototype.deleteBlock = function addBlock(hash, andChildren, callback) {
  if (deleteBlockProcessing) {
    callback(new Error('Another block is already processing; wait for callback before adding!!'));
    return;
  }
  deleteBlockProcessing = true;
  var self = this;
  var children = [];
  async.waterfall([
    function(cb) { // Validation checks
      if (!Buffer.isBuffer(hash)) {
        cb(new Error('Hash must be a 32-byte Buffer'));
        return;
      } else if (hash.length !== 32) {
        cb(new Error('Hash must be 32 bytes long (passed as '+hash.length+')'));
        return;
      }
      cb(null); // Validation passed
    },
    function(cb) { // Check for existing
      self.db.blockExists(hash, cb);
    },
    function(rs, cb) { // See if block already exists
      if (rs !== true) {
        // Block doesn't exist; nothing to do
        callback(null); // Escapes out of the async block
        return;
      }

      self.db.read(hash, cb);
    },
    function(block, cb) {
      console.log(block);
      children = block.children;
      self.db.delete(hash, cb);
    },
    function (cb) {
      self._delRoot(hash, cb);
    },
    function (cb) {
      self._delTip(hash, cb);
    },
    function (cb) {
      // TODO: Check if parent has no other children. If so, it's now a Tip
      console.log(children);
      if (andChildren === true && children.length > 0) {
        // Delete all the children, and their children's children...
        deleteBlockProcessing = false;
        async.eachSeries(children, function(childHash, cbEach) {
          self.deleteBlock(childHash, true, cbEach);
        }, cb);
      } else {
        // Children need their height updated, and to be marked as Roots
        async.eachSeries(children, function(childHash, cbEach) {
          self.db.updateHeight(childHash, 0, function(err) {
            console.log('Height of', childHash, 'set to zero');
            if (err !== null) {
              cbEach(err);
              return;
            }
            self._addRoot(childHash, cbEach);
          });
        }, cb);
      }
    }
  ], callback);
};

/**
 * Expose method from Storage class
 * @param {Function} callback Function to be called when complete
 */
BTCBlockchain.prototype.getTips = function getTips(callback) {
  this.db.getTips(callback);
};

/**
 * Expose method from Storage class
 * @param {Function} callback Function to be called when complete
 */
BTCBlockchain.prototype.getRoots = function getRoots(callback) {
  this.db.getRoots(callback);
};


/**
 * Clear the entire database
 * @param {Function} callback Function to be called when complete
 */
BTCBlockchain.prototype.purge = function(callback) {
  this.db.deleteAll(callback);
};

BTCBlockchain.prototype._addTip = function addTip(buff, cb) {
  var self = this;
  self.db.getTips(function(tips) {
    tips.push(buff);
    tips = tips.unique();
    self.db.setTips(tips, cb);
  });
};

BTCBlockchain.prototype._delTip = function delTip(buff, cb) {
  var self = this;
  self.db.getTips(function(tips) {
    var searchBuff = buff.toString('hex');
    var newTips = tips.filter(function(tipHash) {
      return tipHash.toString('hex') != searchBuff;
    });
    if (newTips.length === tips.length) {
      // Nothing was removed
      cb(null);
      return;
    }
    self.db.setTips(newTips, cb);
  });
};

BTCBlockchain.prototype._addRoot = function addRoot(buff, cb) {
  var self = this;
  self.db.getRoots(function(roots) {
    roots.push(buff);
    roots = roots.unique();
    self.db.setRoots(roots, cb);
  });
};

BTCBlockchain.prototype._delRoot = function delRoot(buff, cb) {
  var self = this;
  self.db.getRoots(function(roots) {
    var searchBuff = buff.toString('hex');
    var newRoots = roots.filter(function(rootHash) {
      return rootHash.toString('hex') != searchBuff;
    });
    if (newRoots.length == roots.length) {
      // Nothing was removed
      cb(null);
      return;
    }
    self.db.setRoots(newRoots, cb);
  });
};
