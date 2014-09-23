/*jslint node: true */
var BTCBlockchain = require('../lib/BTCBlockchain.js').BTCBlockchain;
var async = require('async');

var bc = new BTCBlockchain();

bc.on('launched', function() {
  console.log("Blockchain done launching");
  bc.purge(function(err) {
    console.log('Starting test');
    if (err != null) {
      console.log(err);
      return;
    }

    async.waterfall([
      function(cb) {
        bc.addBlock(
          new Buffer('0000000000000000000000000000000000000000000000000000000000000002', 'hex'),
          new Buffer('0000000000000000000000000000000000000000000000000000000000000001', 'hex'),
          new Buffer('bar2', 'ascii'),
          cb
        );
      },
      function(cb) {
        bc.addBlock(
          new Buffer('0000000000000000000000000000000000000000000000000000000000000001', 'hex'),
          new Buffer('0000000000000000000000000000000000000000000000000000000000000000', 'hex'),
          new Buffer('bar1', 'ascii'),
          cb
        );
      },
      function(cb) {
        bc.addBlock(
          new Buffer('0000000000000000000000000000000000000000000000000000000000000003', 'hex'),
          new Buffer('0000000000000000000000000000000000000000000000000000000000000002', 'hex'),
          new Buffer('bar3', 'ascii'),
          cb
        );
      },
      function(cb) {
        bc.addBlock(
          new Buffer('0000000000000000000000000000000000000000000000000000000000000004', 'hex'),
          new Buffer('0000000000000000000000000000000000000000000000000000000000000002', 'hex'),
          new Buffer('bar4', 'ascii'),
          cb
        );
      },
      function(cb) {
        bc.addBlock(
          new Buffer('0000000000000000000000000000000000000000000000000000000000000005', 'hex'),
          new Buffer('00000000000000000000000000000000000000000000000000000000000000FF', 'hex'),
          new Buffer('bar5', 'ascii'),
          cb
        );
      }
    ], function(err) {
      if (err) console.log(err);

      console.log('');
      walkTree();
    });
  });
});

var walkTree = function() {
  bc.getTips(function(tips) {
    console.log('There are '+tips.length+' tips in the tree');
    async.eachSeries(tips, function(block, cb) {
      bc.getBlock(block, function(err, block) {
        console.log(block.data.toString('ascii'), block);
        cb();
      });
    });
  });
};

var counter = 0;
bc.on('blockAdded', function(d) {
  console.log('Block Added:', d.data.toString('ascii'), d);
  counter++;
});

bc.launch(function(err, rs) {
  if (err === null) return; // Successful launch
  console.log(err, rs);
});
