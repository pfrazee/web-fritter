module.exports = class FreeMap {
  constructor (reserved = 0) {
    this._free = []
    this._data = []

    while (this._data.length < reserved) this._data.push(null)
  }

  alloc () {
    if (this._free.length) {
      return this._free.pop()
    }
    this._data.push(null)
    return this._data.length - 1
  }

  add (data) {
    const id = this.alloc()
    this._data[id] = data
    return id
  }

  free (id) {
    this._data[id] = null
    this._free.push(id)
  }

  set (id, data) {
    if (id === this._data.length) this._data.push(null)
    if (id >= this._data.length) throw new Error('Invalid id')
    this._data[id] = data
  }

  get (id) {
    return this._data[id]
  }

  * [Symbol.iterator] () {
    for (let i = 0; i < this._data.length; i++) {
      if (this._data[i] !== null) yield [i, this._data[i]]
    }
  }
}
