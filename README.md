# Bitcoin Blockchain  management
This library manages a blockchain in the most basic sense: It accepts blocks, which point to previous blocks, and allows retrieval of them. It has no notion of "transactions", "addresses" or the like.

## Things it does do:
* Saves block data to a back-end service (LevelDB by default) for persistence
* Adds a height attribute to blocks added to it (Genesis block(s) are height zero)
* Allows retrieval of block data by hash
* Keeps track of chain tips
* Keeps track of chain roots
* Allows deleting blocks (and optionally all children of that block)
* Sends events to alert other modules of chain activity

## Things it does not do:
* Lookup by transaction ID
* Track unspent transaction outputs (UTXO)
* Automatic pruning/fork resolutions

## Usage
For maximum space savings, the block objects passed to the chain should be Buffer objects representing the binary block data. This is the same structure the default `bitcoind` client uses for its block storage, and still the blockchain cache is many, many gigabytes in size; saving JSON or other representations would make the database even larger, so module aims to avoid that.

### `addBlock(key, parent, data)`
Adds a block to the chain. `key` is the block's unique identifier (hash), `parent` is the parent's unique identifier, and `data` is the block data itself. All three are Buffer objects.

When the first block is added, the parent block is unknown, so the new block is given a height of zero (genesis/root), and is also a chain tip. Since it is both root and tip, it is also an orphan at that point.

Subsequent blocks on the main chain will find their parent already exists, so will get a height one more than their parent.

When a new block is added, its hash is also checked against all the known root blocks, to see if this block formed a link to a detached chain. If a match is found, the root block being attach has its height adjusted to place it after its parent, and all children of that detached root get their height updated too.

This module is perfectly happy to have multiple side-branches and even parallel trees being maintained. It's up to other modules to set the logic and take the initiative when pruning/reorganizing is needed.

## Events
All three events get the same structured data payload: `{ hash: HASH, data: BLOCKDATA, height: INTEGER, isRoot: BOOLEAN, isTip: BOOLEAN }`

### BlockAdded
Block `hash` has been added and assigned the height of `height`.

### BlockDeleted
Block `hash` has been removed from the chain. It previously had the height of `height`.

### BlockChanged
Block `hash` has been been reorganized, and now has the height of `height`.
