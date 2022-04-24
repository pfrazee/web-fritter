const Nanomessage = require('./src/nanomessage')

const nanomessage = (opts) => new Nanomessage(opts)
nanomessage.Nanomessage = Nanomessage
nanomessage.errors = require('./src/errors')
nanomessage.BJSON = require('./src/buffer-json')
module.exports = nanomessage
