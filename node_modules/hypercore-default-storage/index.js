const RAF = require('random-access-file')

let lock = null
let sparse = null

try {
  const fsctl = require('fsctl')
  lock = fsctl.lock
  sparse = null // fsctl.sparse, disable until we investigate the regression on windows
} catch (_) {}

module.exports = defaultStorage

function defaultStorage (name, opts) {
  // make it easier to cache tree nodes without the big unsafe arraybuffer attached
  if (isTree(name)) return new RAF(name, { sparse, alloc: Buffer.alloc, ...opts })
  if (!isBitfield(name)) return new RAF(name, { sparse, ...opts })
  return new RAF(name, { lock, sparse, ...opts })
}

function isTree (name) {
  return name === 'tree' || name.endsWith('/tree')
}

function isBitfield (name) {
  return name === 'bitfield' || name.endsWith('/bitfield')
}
