module.exports = {
  callbackMethods: [
    'ready',
    'open',
    'update',
    'download',
    'proof',
    'put',
    'clear',
    'signature',
    'verify',
    'rootHashes',
    'seek',
    'head',
    'get',
    'getBatch',
    'finalize',
    'append',
    'flush',
    'audit',
    'destroyStorage',
    'close'
  ],
  cancelableMethods: [
    'cancel',
    'undownload'
  ]
}
