const LevelUtil = require('./util-level')
const WebDBWhereClause = require('./where-clause')
const Indexer = require('./indexer')
const {assert, debug} = require('./util')
const {QueryError, ParameterError} = require('./errors')

class WebDBQuery {
  constructor (table) {
    this._table = table
    this._filters = []
    this._reverse = false
    this._offset = 0
    this._limit = false
    this._until = null
    this._where = null
  }

  // () => WebDBQuery
  clone () {
    var clone = new WebDBQuery()
    for (var k in this) {
      if (k.startsWith('_')) {
        clone[k] = this[k]
      }
    }
    return clone
  }

  // () => Promise<Number>
  async count () {
    var count = 0
    await this.each(() => { count++ })
    return count
  }

  // () => Promise<Number>
  async delete () {
    var deletes = []
    await this.each(record => {
      if (this._table.isHelperTable) {
        deletes.push(this._table.level.del(record.getRecordURL()))
      } else {
        const drive = this._table.db._drives[record.getRecordOrigin()]
        debug('WebDBQuery.delete', record)
        if (drive && drive.writable) {
          const filepath = record.getRecordURL().slice(record.getRecordOrigin().length)
          deletes.push(
            drive.unlink(filepath)
              .then(() => Indexer.indexDrive(this._table.db, drive))
          )
        } else {
          debug('WebDBQuery.delete not enacted:', !drive ? 'Drive not found' : 'Drive not writable')
        }
      }
    })
    await Promise.all(deletes)
    return deletes.length
  }

  // (Function) => Promise<Void>
  async each (fn) {
    return LevelUtil.iterate(this, fn)
  }

  // (Function) => Promise<Void>
  async eachKey (fn) {
    assert(typeof fn === 'function', ParameterError, `First parameter of .eachKey() must be a function, got ${fn}`)
    return this.each(cursor => {
      // choose the key
      var key
      if (this._where && this._where._index) {
        key = this._where._index // use the where clause's key if there is one
      }

      // emit all
      if (Array.isArray(cursor[key])) {
        cursor[key].forEach(v => fn(v))
      } else {
        if (key) {
          fn(cursor[key])
        } else {
          fn(cursor.getRecordURL())
        }
      }
    })
  }

  // (Function) => Promise<Void>
  async eachUrl (fn) {
    assert(typeof fn === 'function', ParameterError, `First parameter of .eachUrl() must be a function, got ${fn}`)
    return this.each(cursor => { fn(cursor.getRecordURL()) })
  }

  // (Function) => WebDBQuery
  filter (fn) {
    assert(typeof fn === 'function', ParameterError, `First parameter of .filter() must be a function, got ${fn}`)
    this._filters.push(fn)
    return this
  }

  // () => Promise<Object>
  async first () {
    var arr = await this.limit(1).toArray()
    return arr[0]
  }

  // () => Promise<Array<String>>
  async keys () {
    var keys = []
    await this.eachKey(key => keys.push(key))
    return keys
  }

  // () => Promise<Object>
  async last () {
    return this.reverse().first()
  }

  // (Number) => WebDBQuery
  limit (n) {
    assert(typeof n === 'number', ParameterError, `The first parameter to .limit() must be a number, got ${n}`)
    this._limit = n
    return this
  }

  // (Number) => WebDBQuery
  offset (n) {
    assert(typeof n === 'number', ParameterError, `The first parameter to .offset() must be a number, got ${n}`)
    this._offset = n
    return this
  }

  // (index) => WebDBWhereClause
  or (index) {
    assert(this._where, QueryError, 'Can not have a .or() before a .where()')
    // TODO
  }

  // (index) => WebDBQuery
  orderBy (index) {
    assert(typeof index === 'string', ParameterError, `The first parameter to .orderBy() must be a string, got ${index}`)
    assert(!this._where, QueryError, 'Can not have an .orderBy() and a .where() - where() implicitly sets the orderBy() to its key')
    this._where = new WebDBWhereClause(this, index)
    return this
  }

  // () => Promise<Array<String>>
  async urls () {
    var urls = []
    await this.eachUrl(url => urls.push(url))
    return urls
  }

  // () => WebDBQuery
  reverse () {
    this._reverse = true
    return this
  }

  // () => Promise<Array<Object>>
  async toArray () {
    var records = []
    await this.each(record => records.push(record))
    return records
  }

  // () => Promise<Array<String>>
  async uniqueKeys () {
    return Array.from(new Set(await this.keys()))
  }

  // (Function) => WebDBQuery
  until (fn) {
    assert(typeof fn === 'function', ParameterError, `First parameter of .until() must be a function, got ${fn}`)
    this._until = fn
    return this
  }

  // (Object|Function) => Promise<Number>
  async update (objOrFn) {
    var fn
    if (objOrFn && typeof objOrFn === 'object') {
      // create a function which applies the object updates
      const obj = objOrFn
      fn = record => {
        for (var k in obj) {
          if (typeof obj[k] !== 'undefined') {
            record[k] = obj[k]
          }
        }
      }
    } else if (typeof objOrFn === 'function') {
      fn = objOrFn
    } else {
      throw new ParameterError(`First parameter of .update() must be a function or object, got ${objOrFn}`)
    }

    // apply updates
    var updates = []
    await this.each(record => {
      const drive = this._table.isHelperTable ? false : this._table.db._drives[record.getRecordOrigin()]
      debug('WebDBQuery.update', record)
      if (this._table.isHelperTable || (drive && drive.writable)) {
        const filepath = record.getRecordURL().slice(record.getRecordOrigin().length)

        // run update
        fn(record)

        // run validation
        if (this._table.schema.validate) {
          let isValid = this._table.schema.validate(record)
          if (!isValid) throw new Error('The record did not pass validation.')
        }

        // run preprocessor
        if (this._table.schema.preprocess) {
          let newRecord = this._table.schema.preprocess(record)
          if (newRecord) record = newRecord
        }

        // run serializer
        if (this._table.schema.serialize) {
          let newRecord = this._table.schema.serialize(record)
          if (newRecord) record = newRecord
        }

        if (this._table.isHelperTable) {
          // write to KV
          updates.push(this._table.level.put(record.getRecordURL(), {
            url: record.getRecordURL(),
            origin: record.getRecordOrigin(),
            indexedAt: Date.now(),
            record
          }))
        } else {
          // write to drive
          updates.push(
            drive.writeFile(filepath, JSON.stringify(record))
              .then(() => {
                if (typeof drive.commit === 'function') {
                  // legacy dat api
                  return drive.commit()
                }
              })
              .then(() => Indexer.indexDrive(this._table.db, drive))
          )
        }
      } else {
        debug('WebDBQuery.update not enacted:', !drive ? 'Drive not found' : 'Drive not writable')
      }
    })
    await Promise.all(updates)
    return updates.length
  }

  // (index) => WebDBWhereClause
  where (index) {
    assert(!this._where, QueryError, 'Can not have two .where()s')
    this._where = new WebDBWhereClause(this, index)
    return this._where
  }
}

module.exports = WebDBQuery
