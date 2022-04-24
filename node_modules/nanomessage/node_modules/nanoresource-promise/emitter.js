const { EventEmitter } = require('events')
const nanoresource = require('.')

const kNanoresource = Symbol('nanoresource')

class NanoresourcePromise extends EventEmitter {
  constructor (opts = {}) {
    super()

    this[kNanoresource] = nanoresource({
      open: opts.open || this._open.bind(this),
      close: opts.close || this._close.bind(this),
      reopen: opts.reopen
    })
  }

  get opened () {
    return this[kNanoresource].opened
  }

  get opening () {
    return this[kNanoresource].opening
  }

  get closed () {
    return this[kNanoresource].closed
  }

  get closing () {
    return this[kNanoresource].closing
  }

  get actives () {
    return this[kNanoresource].actives
  }

  /**
   * @returns {Promise}
   */
  async open () {
    await this[kNanoresource].open()
    this.emit('opened')
  }

  /**
   * @returns {Promise}
   */
  async close (allowActive) {
    await this[kNanoresource].close(allowActive)
    this.emit('closed')
  }

  /**
   * @returns {boolean}
   */
  active (cb) {
    return this[kNanoresource].active(cb)
  }

  /**
   * @returns {boolean}
   */
  inactive (cb, err, value) {
    return this[kNanoresource].inactive(cb, err, value)
  }

  /**
   * @abstract
   */
  async _open () {}

  /**
   * @abstract
   */
  async _close () {}
}

module.exports = (opts) => new NanoresourcePromise(opts)
module.exports.NanoresourcePromise = NanoresourcePromise
