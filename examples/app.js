var BTCBlockchain = require('../lib/BTCBlockchain.js').BTCBlockchain;

var bc = new BTCBlockchain();

bc.launch(function(err, rs) {
  console.log(err, rs);
});