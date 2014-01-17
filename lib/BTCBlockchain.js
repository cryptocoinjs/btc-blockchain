var Storage = require('./Storage');
var async = require('async');
var fs = require('fs');

var BTCBlockchain = exports.BTCBlockchain = function(options) {
  options = (typeof options === 'undefined')? {} : options;
  var defaultOpts = {
    dataDir: this.getDataDir();
  };
  for (var name in defaultOpts) {
    if (defaultOpts.hasOwnProperty(name) && !options.hasOwnProperty(name)) {
      options[name] = defaultOpts[name];
    }
  }
  this.options = options;
};

var BTCBlockchain.prototype.launch = function launch(callback) {
  async.series([
    function(cb) {
      fs.mkdir(this.options.dataDir, cb);
    },
    function(cb) {
      this.db = new Storage(this.options.dataDir.'/blockchain.db', cb);
    }
  ], callback);
};


var BTCBlockchain.prototype.getDataDir = function getDataDir() {
  // TODO: Support non POSIX OSes
  return process.env.HOME + "/.cryptocoinjs";
};
