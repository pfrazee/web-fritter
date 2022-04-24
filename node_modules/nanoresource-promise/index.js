const nanoresource = require('nanoresource')

function callbackPromise () {
  let callback

  const promise = new Promise((resolve, reject) => {
    callback = (err, value) => {
      if (err) reject(err)
      else resolve(value)
    }
  })

  callback.promise = promise
  return callback
}

const kProcessPromise = Symbol('processpromise')

class NanoresourcePromise extends nanoresource {
  constructor (opts) {
    super(opts)

    const prevOpen = this._open.bind(this)
    const prevClose = this._close.bind(this)
    this._open = (cb) => this[kProcessPromise](prevOpen, cb)
    this._close = (cb) => this[kProcessPromise](prevClose, cb)
  }

  /**
   * @returns {Promise}
   */
  open () {
    const callback = callbackPromise()
    super.open(callback)
    return callback.promise
  }

  /**
   * @returns {Promise}
   */
  close (allowActive = false) {
    let callback
    if (typeof allowActive === 'function') {
      callback = allowActive
      allowActive = false
    } else {
      callback = callbackPromise()
    }
    super.close(allowActive, callback)
    return callback.promise
  }

  /**
   * @returns {Promise}
   */
  active () {
    const callback = nanoresource.callbackPromise()
    super.active(callback)
    return callback.promise
  }

  /**
   * @returns {Promise}
   */
  inactive (err, val) {
    const callback = nanoresource.callbackPromise()
    super.inactive(callback, err, val)
    return callback.promise
  }

  async _open () {}
  async _close () {}

  async [kProcessPromise] (fnPromise, cb) {
    try {
      await fnPromise()
      cb()
    } catch (err) {
      cb(err)
    }
  }
}

module.exports = (opts) => new NanoresourcePromise(opts)
module.exports.NanoresourcePromise = NanoresourcePromise
