const NanomessageRPC = require('./src/nanomessage-rpc')

module.exports = (...args) => new NanomessageRPC(...args)
module.exports.NanomessageRPC = NanomessageRPC
module.exports.useSocket = require('./src/use-socket')
module.exports.errors = require('./src/errors')
