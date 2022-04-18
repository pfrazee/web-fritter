const anymatch = require('anymatch')
const EventEmitter = require('events')
const IndexedLevel = require('./indexed-level')
const Indexer = require('./indexer')
const WebDBQuery = require('./query')
const {assert, debug, veryDebug, lock, toDriveUrl} = require('./util')
const {ParameterError, QueryError} = require('./errors')
const URL = require('url-parse')

// exported api
// =

class WebDBTable extends EventEmitter {
  constructor (db, name, schema) {
    super()
    this.db = db
    this.name = name
    this.schema = schema
    this.isHelperTable = !!schema.helperTable
    veryDebug('WebDBTable', this.name, this.schema)
    this._filePattern = schema.filePattern || '*.json'

    // construct db object
    this.level = IndexedLevel(db.level.sublevel(name, {valueEncoding: 'json'}), schema.index)
  }

  // queries
  // =

  // () => WebDBQuery
  query () {
    return new WebDBQuery(this)
  }

  // () => Promise<Number>
  async count () {
    return this.query().count()
  }

  // (url) => Promise<url>
  async delete (url) {
    return this.where(':url').equals(url).delete()
  }

  // (Function) => Promise<Void>
  async each (fn) {
    return this.query().each(fn)
  }

  // (Function) => WebDBQuery
  filter (fn) {
    return this.query().filter(fn)
  }

  // (url) => Promise<Object>
  // (key, value) => Promise<Object>
  async get (...args) {
    if (args.length === 2) {
      return getByKeyValue(this, ...args)
    }
    return getByRecordUrl(this, ...args)
  }

  // (Number) => WebDBQuery
  limit (n) {
    return this.query().limit(n)
  }

  // (Number) => WebDBQuery
  offset (n) {
    return this.query().offset(n)
  }

  // (index) => WebDBQuery
  orderBy (index) {
    return this.query().orderBy(index)
  }

  // (url, record) => Promise<url>
  async put (url, record, noLockNeeded = false) {
    assert(url && typeof url === 'string', ParameterError, 'The first parameter of .put() must be url')
    assert(record && typeof record === 'object', ParameterError, 'The second parameter of .put() must be a record object')

    // run validation
    if (this.schema.validate) {
      let isValid = this.schema.validate(record)
      if (!isValid) throw new Error('The record did not pass validation.')
    }

    // run preprocessor
    if (this.schema.preprocess) {
      let newRecord = this.schema.preprocess(record)
      if (newRecord) record = newRecord
    }

    // run serializer
    if (this.schema.serialize) {
      let newRecord = this.schema.serialize(record)
      if (newRecord) record = newRecord
    }

    if (this.isHelperTable) {
      // write the KV
      await this.level.put(url, {
        url,
        origin: '',
        indexedAt: Date.now(),
        record
      })
    } else {
      // lookup the drive
      var urlp = new URL(url)
      var origin = urlp.protocol + '//' + urlp.hostname
      var drive = this.db._drives[origin]
      if (!drive) {
        throw new QueryError('Unable to put(): the given drive is not part of the index')
      }
      if (!drive.writable) {
        throw new QueryError('Unable to put(): the given drive is not owned by this user')
      }

      // write the file
      debug('Table.put', urlp.pathname)
      veryDebug('Table.put drive', drive.url)
      veryDebug('Table.put record', record)
      var release = noLockNeeded === true ? noop : await lock(toDriveUrl(drive))
      try {
        await drive.writeFile(urlp.pathname, JSON.stringify(record))
        if (typeof drive.commit === 'function') {
          // legacy api
          await drive.commit()
        }
        await Indexer.indexDrive(this.db, drive)
        return url
      } finally {
        release()
      }
    }
  }

  // () => WebDBQuery
  reverse () {
    return this.query().reverse()
  }

  // () => Promise<Array>
  async toArray () {
    return this.query().toArray()
  }

  // (url, Object|Function) => Promise<Number>
  async update (url, objOrFn) {
    return updateByUrl(this, url, objOrFn)
  }

  // (url, Object|Function) => Promise<url>
  async upsert (url, objOrFn) {
    assert(url && typeof url === 'string', ParameterError, 'The first parameter of .upsert() must be a url')
    assert(objOrFn && (typeof objOrFn === 'object' || typeof objOrFn === 'function'), ParameterError, 'The second parameter of .upsert() must be a record object or an update function')

    // update or add
    var release = await lock(url)
    try {
      var changes = await updateByUrl(this, url, objOrFn, true)
      if (changes === 0) {
        return this.put(url, typeof objOrFn === 'function' ? objOrFn() : objOrFn, true)
      }
      return changes
    } finally {
      release()
    }
  }

  // (index|query) => WebDBWhereClause|WebDBQuery
  where (indexOrQuery) {
    return this.query().where(indexOrQuery)
  }

  // record helpers
  // =

  // (String) => Boolean
  isRecordFile (filepath) {
    if (this.isHelperTable) {
      return false
    }
    return anymatch(this._filePattern, filepath)
  }

  // (Hyperdrive) => Array<Object>
  async listRecordFiles (drive) {
    if (this.isHelperTable) {
      return []
    }
    try {
      // scan for matching records
      let records = await drive.readdir('/', {recursive: true})
      return records.filter(name => anymatch(this._filePattern, name)).map(name => {
        return {
          recordUrl: drive.url + '/' + this.name + '/' + name,
          table: this
        }
      })
    } catch (e) {
      return []
    }
  }
}

function getByKeyValue (table, key, value) {
  debug('getByKeyValue')
  veryDebug('getByKeyValue table', table.name)
  veryDebug('getByKeyValue key', key)
  veryDebug('getByKeyValue value', value)
  return table.where(key).equals(value).first()
}

function getByRecordUrl (table, url) {
  debug('getByRecordUrl')
  veryDebug('getByRecordUrl table', table.name)
  veryDebug('getByRecordUrl url', url)
  return table.where(':url').equals(url).first()
}

async function updateByUrl (table, url, updates, noLockNeeded = false) {
  debug('updateByUrl')
  url = url && url.url ? url.url : url
  veryDebug('updateByUrl table', table.name)
  veryDebug('updateByUrl url', url)
  veryDebug('updateByUrl updates', updates)
  assert(typeof url === 'string', ParameterError, 'Invalid parameters given to update()')
  assert(updates && (typeof updates === 'object' || typeof updates === 'function'), ParameterError, 'Invalid parameters given to update()')

  var release = noLockNeeded === true ? noop : await lock(toDriveUrl(url))
  try {
    return table.where(':url').equals(url).update(updates)
  } finally {
    release()
  }
}

function noop () {}

module.exports = WebDBTable
