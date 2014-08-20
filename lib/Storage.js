"use strict";
var level = require('levelup');
var async = require('async');

/**
 * LevelDB back-end for Blockchain storage
 *
 * A block hash is a SHA256 hash, so 256 bits, which is 32 bytes long.
 * The keys for the database are:
 *   b[HASH] (33 bytes): block data
 *   b[HASH]h (34 bytes): height of block HASH
 *   mr (2 bytes): Metadata: list of ROOTS
 *   mt (2 bytes): Metadata: list of TIPS
 *
 * This namespacing allows for the smallest possible key sizes,
 * and keeps related block data together.
 *
 * Using LevelDB's built in sorting, querying for a stream starting at b[HASH],
 * and going through b[HASH]\xff will get all block metadata (currently only
 * 'height', but allows room for extending).
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

Storage.prototype.create = function(key, data, height, callback) {
  var blockKey = Buffer.concat([new Buffer('b', 'utf8'), key], key.length+1);
  var heightKey = Buffer.concat([blockKey, new Buffer('h', 'utf8')], blockKey.length+1);
  var heightHex = height.toString(16);
  if (heightHex.length % 2 != 0) {
    heightHex = '0'+heightHex;
  }
  this.handle.batch([
    {type:'put', key:blockKey, value:data},
    {type:'put', key:heightKey, value:heightHex, valueEncoding: 'hex'}
  ], function(err) {
    if (err) {
      callback(err);
      return;
    }
    callback(null, {
      key: key,
      height: height,
      data: data
    });
  });
};

Storage.prototype.read = function(key, callback) {
  var startKey = Buffer.concat([new Buffer('b', 'utf8'), key], key.length+1);
  var endKey = Buffer.concat([startKey, new Buffer([255])], startKey.length+1);
  var rs = this.handle.createReadStream({ start:startKey, end:endKey });
  var out = {};
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

Storage.prototype.update = function(key, data, height, callback) {
  this.create(key, data, height, callback); // LevelDB has no distinction between creating and updating
};

Storage.prototype.delete = function(key, callback) {

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
  this._getBufArray('mr', callback);
};

Storage.prototype.setRoots = function(roots, callback) {
  this._setBufArray('mr', roots, callback);
};

Storage.prototype.getTips = function(callback) {
  this._getBufArray('mt', callback);
};

Storage.prototype.setTips = function(tips, callback) {
  this._setBufArray('mt', tips, callback);
};

Storage.prototype._getBufArray = function(key, callback) {
  var self = this;
  async.waterfall([
    function(cb) {
      self.handle.get(key, {keyEncoding:'utf8', valueEncoding:'utf8'}, function(err, value) {
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
      var roots = value.split(',').map(function(hex) {
        return new Buffer(hex, 'hex');
      });
      cb(null, roots);
    }
  ], callback);
};

Storage.prototype._setBufArray = function(key, value, callback) {
  var valueEncoded = value.map(function(el) {
    return el.toString('hex');
  }).join(',');
  self.handle.put(key, valueEncoded, {keyEncoding:'utf8', valueEncoding:'utf8'}, callback);
};
