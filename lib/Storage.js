/*jslint node: true */
"use strict";
var level = require('levelup');
var async = require('async');

/**
 * LevelDB back-end for Blockchain storage
 *
 * A block hash is a SHA256 hash, so 256 bits, which is 32 bytes long.
 * The keys for the database are:
 *   b[HASH] (33 bytes): block data
 *   b[HASH]h (34 bytes): Height of block HASH
 *   b[HASH]c (34 bytes): list of Child blocks
 *   b[HASH]p (34 bytes): Parent block
 *   mr (2 bytes): Metadata: list of ROOTS
 *   mt (2 bytes): Metadata: list of TIPS
 *
 * This namespacing allows for the smallest possible key sizes,
 * and keeps related block data together.
 *
 * A list of children for each block is needed to be kept, because otherwise
 * in order to find children of a given block, every single block in the
 * database would have to be read to search for any that have a parent hash
 * matching the searched-for parent.
 *
 * Using LevelDB's built in sorting, querying for a stream starting at b[HASH],
 * and going through b[HASH]\xff will get all block metadata (height, children,
 * parent, and any future metadata).
 */
var Storage = exports.Storage = function Storage(uri, callback) {
  var defaultCreateOpts = {
    createIfMissing: true,
    keyEncoding: 'binary', // Return Buffer objects
    valueEncoding: 'binary' // Return Buffer objects
  };

  var self = this;
  async.waterfall([
    function(cb) {
      level(uri, defaultCreateOpts, cb);
    },
    function(db, cb) {
      self.handle = db;
      cb(null);
    }
  ], callback);
};

/**
 * Add block to database
 * @param  {Buffer}   hash     Block hash to be used as key in the database
 * @param  {Object}   data     Collection of metadata for the Block. Can have 'data', 'parent', 'height', and 'children' properties.
 * @param  {Function} callback Function to call when complete
 * @return {Undefined}
 */
Storage.prototype.create = function(hash, data, callback) {
  var blockKey = Buffer.concat([new Buffer('b', 'utf8'), hash], hash.length+1);
  var batch = this.handle.batch();

  if (typeof data.data !== 'undefined') {
    batch.put(blockKey, data.data);
  }
  if (typeof data.parent !== 'undefined') {
    var parentKey = Buffer.concat([blockKey, new Buffer('p', 'utf8')], blockKey.length+1);
    batch.put(parentKey, data.parent);
  }
  if (typeof data.height !== 'undefined') {
    var heightKey = Buffer.concat([blockKey, new Buffer('h', 'utf8')], blockKey.length+1);
    var heightHex = data.height.toString(16);
    if (heightHex.length % 2 != 0) {
      heightHex = '0'+heightHex;
    }
    batch.put(heightKey, heightHex, {valueEncoding:'hex'});
  }
  if (typeof data.children !== 'undefined') {
    var childrenKey = Buffer.concat([blockKey, new Buffer('c', 'utf8')], blockKey.length+1);
    var children = data.children;
    if (Array.isArray(data.children)) {
      children = Buffer.concat(children);
      if (children.length % 32 !== 0) {
        callback(new Error('Input elements not all 32 bytes long'));
        batch.clear();
      } else {
        batch.put(childrenKey, children);
      }
    } else {
      batch.put(childrenKey, children);
    }
  }

  batch.write(function(err) {
    var out = {
      hash: hash,
      data: data
    };
    if (err) {
      callback(err, out);
      return;
    }
    callback(null, out);
  });
};

Storage.prototype.read = function(key, callback) {
  var startKey = Buffer.concat([new Buffer('b', 'utf8'), key], key.length+1);
  var endKey = Buffer.concat([startKey, new Buffer([255])], startKey.length+1);
  var rs = this.handle.createReadStream({ start:startKey, end:endKey });
  var out = {
    data: new Buffer([0]),
    height: 0,
    children: [],
    parent: new Buffer([0])
  };
  var hasData = false;
  rs.on('data', function(data) {
    hasData = true;
    if (data.key.length == 33) {
      // This is the root key; the block data
      out.data = data.value;
    } else {
      var suffix = data.key.toString('utf8', 33);
      switch(suffix) {
        case 'h':
          out.height = parseInt(data.value.toString('hex'), 16);
          break;
        case 'c':
          out.children = [];
          if (data.value.length % 32 !== 0) {
            callback(new Error('Value error: '+data.key.toString('hex')+' value length of '+data.value.length+' not a multiple of 32'));
            return;
          }
          for (var i = 0; i < data.value.length; i+=32) {
            var slice = new Buffer(32);
            data.value.copy(slice, 0, i, i+32);
            out.children.push(slice);
          }
          break;
        case 'p':
          out.parent = data.value;
          break;
        default:
          console.log('Unknown metadata suffix: '+suffix);
      }
    }
  });
  rs.on('error', function(err) {
    console.log('ERROR: '+err);
    callback(err);
  });
  rs.on('close', function() {
    if (!hasData) {
      callback(null, false);
      return;
    }
    callback(null, out);
  });
};

Storage.prototype.update = function(hash, data, callback) {
  this.create(hash, data, callback); // LevelDB has no distinction between creating and updating
};

Storage.prototype.delete = function(key, callback) {
  // TODO: Create Implementation
};

Storage.prototype.deleteAll = function(callback) {
  var ws = this.handle.createWriteStream({ type:'del' });
  var rs = this.handle.createKeyStream();
  rs.on('end', function() {
    ws.end();
  });
  ws.on('close', callback);
  rs.on('data', function(key) {
    ws.write({key:key});
  });
};

Storage.prototype.blockExists = function(key, callback) {
  this.read(key, function(err, rs) {
    if (err !== null) {
      callback(err);
      return;
    }
    if (rs === false) {
      callback(null, false);
      return;
    }
    callback(null, true);
  });
};

Storage.prototype.getRoots = function(callback) {
  this._getBufArray(new Buffer('mr', 'utf8'), callback);
};

Storage.prototype.setRoots = function(roots, callback) {
  this._setBufArray(new Buffer('mr', 'utf8'), roots, callback);
};

Storage.prototype.getTips = function(callback) {
  this._getBufArray(new Buffer('mt', 'utf8'), callback);
};

Storage.prototype.setTips = function(tips, callback) {
  this._setBufArray(new Buffer('mt', 'utf8'), tips, callback);
};

Storage.prototype.updateHeight = function(hash, height, callback) {
  var self = this;
  self.read(hash, function(err, rs) {
    async.series([
      function(cb) { // Update the current block's height
        self.update(hash, {height:height}, cb);
      },
      function(cb) { // Update each child's height
        async.each(rs.children, function(childHash, cbEach) {
          self.updateHeight(childHash, height+1, cbEach); // Recurse, so height is updated down the tree
        }, cb);
      }], callback);
  });
};

Storage.prototype._getBufArray = function(key, callback) {
  var self = this;
  async.waterfall([
    function(cb) {
      self.handle.get(key, function(err, value) {
        cb(null, err, value); // Bypass async's error-handling for this one
      });
    },
    function(err, value, cb) { // Handle 'notFound' errors as not a critical fail
      if (err) {
        if (err.notFound) {
          cb(null, []);
          return;
        }
        cb(err); // Other error; throw it
        return;
      }
      if (value.length % 32 !== 0) {
        cb(new Error('Meta value error: '+key.toString('hex')+' value length of '+value.length+' not a multiple of 32'));
        return;
      }
      var roots = [];
      for (var i = 0; i < value.length; i+=32) {
        var slice = new Buffer(32);
        value.copy(slice, 0, i, i+32);
        roots.push(slice);
      }
      cb(null, roots);
    }
  ], function(err, roots) {
    if (err !== null) {
      console.log(err);
      callback([]);
      return;
    }
    callback(roots);
  });
};

/**
 * Save a list of hashes to a given key
 * @param {Buffer}   key      They key to store the list under
 * @param {Array}    value    An array of Buffer objects, each 32-bytes long
 * @param {Function} callback Function to be called when complete
  */
Storage.prototype._setBufArray = function(key, value, callback) {
  if (!Array.isArray(value)) {
    callback(new Error('Input value is not an array'));
    return;
  }
  if (value.length === 0) {
    // Can't save an empty buffer as a value; so clear the key instead
    this.handle.del(key, callback);
    return;
  }
  var valueEncoded = Buffer.concat(value);
  if (valueEncoded.length % 32 !== 0) {
    callback(new Error('Input elements not all 32 bytes long'));
    return;
  }
  this.handle.put(key, valueEncoded, {keyEncoding:'utf8'}, callback);
};
