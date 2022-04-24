function iterate (x, decode) {
  if (typeof x !== 'object') {
    if (decode && Object.prototype.toString.call(x) === '[object String]' && x.startsWith('base64:')) {
      return Buffer.from(x.slice('base64:'.length), 'base64')
    }
    return x
  }

  let k
  let tmp
  const type = Object.prototype.toString.call(x)

  if (!decode && type === '[object Uint8Array]' && Buffer.isBuffer(x)) {
    return 'base64:' + Buffer.from(x).toString('base64')
  }

  if (type === '[object Object]') {
    tmp = {}
    for (k in x) {
      tmp[k] = iterate(x[k], decode)
    }
    return tmp
  }

  if (type === '[object Array]') {
    k = x.length
    for (tmp = Array(k); k--;) {
      tmp[k] = iterate(x[k], decode)
    }
    return tmp
  }

  return x
}

module.exports = {
  _lastObj: null,
  _lastStr: null,
  _lastLength: null,
  encode (obj, buf, offset) {
    let str
    let length

    if (this._lastObj === obj) {
      str = this._lastStr
      length = this._lastLength
    } else {
      str = JSON.stringify(iterate({ data: obj }))
      length = Buffer.byteLength(str, 'utf8')
    }

    buf.write(str, offset, length, 'utf8')
    this._lastObj = null
    this._lastStr = null
    this._lastLength = null
    return buf.slice(offset, offset + length)
  },
  decode (buf, start, end) {
    start = start || 0
    end = end || buf.length
    return iterate(JSON.parse(buf.slice(start, end)), true).data
  },
  encodingLength (obj) {
    this._lastObj = obj
    this._lastStr = JSON.stringify(iterate({ data: obj }))
    this._lastLength = Buffer.byteLength(this._lastStr, 'utf8')
    return this._lastLength
  }
}
