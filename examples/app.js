/*jslint node: true */
'use strict';
var BTCBlockchain = require('../lib/BTCBlockchain.js');
var async = require('async');

var bc = new BTCBlockchain({
  dataDir: __dirname
});

bc.on('launched', function() {
  console.log("Blockchain done launching");
  bc.purge(function(err) {
    console.log('Starting test');
    if (err != null) {
      console.log('ERROR: '+err);
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
      if (err) console.log('ERROR: '+err);

      console.log('');
      walkTree(function() {
        console.log('');
        testDelete();
      });
    });
  });
});

var walkTree = function(cb) {
  bc.getTips(function(tips) {
    console.log('There are '+tips.length+' tips in the tree');
    async.eachSeries(tips, function(block, cbEach) {
      bc.getBlock(block, function(err, block) {
        if (err !== null) {
          cbEach(err);
          return;
        }
        walkBranch(block, function(err) {
          if (err !== null) {
            cbEach(err);
            return;
          }
          cbEach(null);
        });
      });
    }, cb);
  });
};

var walkBranch = function(block, cb) {
  process.stdout.write(block.data.toString('ascii') + ' ('+block.height+')');
  if (block.height === 0) {
    process.stdout.write("\n");
    cb(null); // Reached root
    return;
  }
  bc.getBlock(block.parent, function(err, parentBlock) {
    if (err !== null) {
      cb(err);
      return;
    }
    if (parentBlock === false) {
      cb("Missing parent?");
      return;
    }
    process.stdout.write(' > ');
    walkBranch(parentBlock, cb);
  });
};

var testDelete = function() {
  console.log('Deleting bar2...');
  bc.deleteBlock(new Buffer('0000000000000000000000000000000000000000000000000000000000000002', 'hex'), false, function(err) {
    if (err !== null) {
      console.log('ERROR: '+err);
      return;
    }
    console.log('Deleted');
    walkTree(function(err) {
      if (err !== null) {
        console.log('ERROR: '+err);
        return;
      }
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
  console.log('ERROR: '+err, rs);
});
