const pLimit = require('p-limit')

class SignalBatch {
  constructor () {
    this._limit = pLimit(1)
    this._cache = []
  }

  onSignal (cb) {
    this._onSignal = (peer, type, batch) => cb && cb(peer, type, batch)
    return this
  }

  onClose (cb) {
    this._onClose = (err) => cb && cb(err)
    return this
  }

  resolution (cb) {
    this._resolution = () => cb && cb()
  }

  add (signal) {
    this._cache.push(signal)

    this._limit(async () => {
      this._limit.clearQueue()
      if (this._cache.length === 0 || this._resolution()) return

      let prev
      let ms = 300
      do {
        prev = this._cache.length
        await new Promise(resolve => setTimeout(resolve, ms))
        ms = 1
      } while (prev < this._cache.length && this._cache.length < 4)

      const batch = this._cache
      this._cache = []
      return this._onSignal(batch)
    }).catch(err => {
      this._limit.clearQueue()
      this._onClose(err)
    }).finally(() => {
      if (this._resolution()) {
        this._limit.clearQueue()
        this._onClose()
      }
    })
  }
}

module.exports = SignalBatch
