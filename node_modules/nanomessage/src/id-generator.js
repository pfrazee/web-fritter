module.exports = class IdGenerator {
  constructor (generate) {
    this._generate = generate
    this._free = []
  }

  get () {
    if (!this._free.length) {
      return this._generate()
    }

    return this._free.pop()
  }

  release (id) {
    this._free.push(id)
  }
}
