const { callbackMethods, cancelableMethods } = require('./methods')

const kHypercore = Symbol('hypercore')
const kValue = Symbol('value')

const getValue = value => value && typeof value === 'object' ? value[kValue] : null

class HypercorePromise {
  constructor (...args) {
    let feed
    if (args.length === 1 && args[0].get && args[0].append) {
      feed = args[0]
    } else {
      feed = require('hypercore')(...args)
    }

    this._cache = {}

    return new Proxy(feed, this)
  }

  get (target, propKey) {
    if (propKey === kHypercore) return target

    const value = Reflect.get(target, propKey)
    if (typeof value === 'function') return this._getMethod(target, propKey, value)
    return value
  }

  _getMethod (target, propKey, func) {
    let method = this._cache[propKey]

    if (method) return method

    if (callbackMethods.includes(propKey)) {
      method = (...args) => {
        // We keep suporting the callback style if we get a callback.
        if (typeof args[args.length - 1] === 'function') {
          return Reflect.apply(func, target, args)
        }

        let id
        const p = new Promise((resolve, reject) => {
          args.push((err, ...result) => {
            if (err) return reject(err)
            if (result.length > 1) {
              resolve(result)
            } else {
              resolve(result[0])
            }
          })
          id = Reflect.apply(func, target, args)
        })
        if (id) {
          p[kValue] = id
        }
        return p
      }
    } else if (cancelableMethods.includes(propKey)) {
      method = (start, end) => {
        if (end !== undefined) {
          return Reflect.apply(func, target, [start, end])
        }

        let id = getValue(start)
        if (!id) id = start

        return Reflect.apply(func, target, [id])
      }
    } else {
      method = (...args) => Reflect.apply(func, target, args)
    }

    this._cache[propKey] = method

    return method
  }
}

module.exports = (...args) => new HypercorePromise(...args)
module.exports.HypercorePromise = HypercorePromise
module.exports.getHypercore = hypercorePromise => hypercorePromise[kHypercore]
module.exports.getValue = getValue
