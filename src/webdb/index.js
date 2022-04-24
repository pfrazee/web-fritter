/* globals window */

const EventEmitter = require('events')
const {BrowserLevel} = require('browser-level')
const {debug, veryDebug, assert, getObjectChecksum} = require('./lib/util')
const {SchemaError} = require('./lib/errors')
const TableDef = require('./lib/table-def')
const Indexer = require('./lib/indexer')
const WebDBTable = require('./lib/table')
const flatten = require('lodash.flatten')
const URL = require('url-parse')

class WebDB extends EventEmitter {
  constructor (name, opts = {}) {
    super()
    if (!opts.Hyperdrive) {
      throw new Error('Must provide {Hyperdrive} opt.')
    }
    this.level = false
    this.name = name
    this.isBeingOpened = false
    this.isOpen = false
    this.Hyperdrive = opts.Hyperdrive
    this._indexMetaLevel = null
    this._tableSchemaLevel = null
    this._tableDefs = {}
    this._drives = {}
    this._tablesToRebuild = []
    this._activeSchema = null
    this._tableFilePatterns = []
    this._dbReadyPromise = new Promise((resolve, reject) => {
      this.once('open', () => resolve(this))
      this.once('open-failed', reject)
    })
  }

  async open () {
    // guard against duplicate opens
    if (this.isBeingOpened || this.level) {
      veryDebug('duplicate open, returning ready promise')
      return this._dbReadyPromise
    }
    if (this.isOpen) {
      return
    }
    this.isBeingOpened = true // TODO needed?
    var neededRebuilds = []

    // open the db
    debug('opening')
    try {
      this.level = new BrowserLevel(this.name, {valueEncoding: 'json'})
      this._tableSchemaLevel = this.level.sublevel('_tableSchema', {valueEncoding: 'json'})
      this._indexMetaLevel = this.level.sublevel('_indexMeta', {valueEncoding: 'json'})

      // construct the tables
      const tableNames = Object.keys(this._tableDefs)
      debug('adding tables', tableNames)
      tableNames.forEach(tableName => {
        this[tableName] = new WebDBTable(this, tableName, this._tableDefs[tableName])
        this._tableFilePatterns.push(this[tableName]._filePattern)
      })
      this._tableFilePatterns = flatten(this._tableFilePatterns)

      // detect table-definition changes
      for (let i = 0; i < tableNames.length; i++) {
        let tableName = tableNames[i]
        let tableChecksum = this._tableDefs[tableName].checksum

        // load the saved checksum
        let lastChecksum
        try { 
          let tableMeta = await this._tableSchemaLevel.get(tableName)
          lastChecksum = tableMeta.checksum
        } catch (e) {}
        
        // compare
        if (lastChecksum !== tableChecksum) {
          neededRebuilds.push(tableName)
        }
      }

      // run rebuilds
      // TODO go per-table
      await Indexer.resetOutdatedIndexes(this, neededRebuilds)
      this.emit('indexes-reset')

      // save checksums
      for (let i = 0; i < tableNames.length; i++) {
        let tableName = tableNames[i]
        let tableChecksum = this._tableDefs[tableName].checksum
        await this._tableSchemaLevel.put(tableName, {checksum: tableChecksum})
      }

      this.isBeingOpened = false
      this.isOpen = true

      // events
      debug('opened')
      this.emit('open')
    } catch (e) {
      console.error('Upgrade has failed', e)
      this.isBeingOpened = false
      this.emit('open-failed', e)
      throw e
    }

    return {
      rebuilds: neededRebuilds
    }
  }

  async close () {
    if (!this.isOpen) return
    debug('closing')
    this.isOpen = false
    if (this.level) {
      this.listSources().forEach(url => Indexer.unwatchDrive(this, this._drives[url]))
      this._drives = {}
      await new Promise(resolve => this.level.close(resolve))
      this.level = null
      veryDebug('db .level closed')
    } else {
      veryDebug('db .level didnt yet exist')
    }
  }

  async delete () {
    if (this.isOpen) {
      await this.close()
    }
    await WebDB.delete(this.name)
  }

  define (tableName, definition) {
    assert(!this.level && !this.isBeingOpened, SchemaError, 'Cannot define a table when database is open')
    let checksum = getObjectChecksum(definition)
    TableDef.validateAndSanitize(definition)
    definition.checksum = checksum
    this._tableDefs[tableName] = definition
  }

  get tables () {
    return Object.keys(this._tableDefs)
      .filter(name => !name.startsWith('_'))
      .map(name => this[name])
  }

  async indexDrive (drive, opts = {}) {
    opts.watch = (typeof opts.watch === 'boolean') ? opts.watch : true

    // handle array case
    if (Array.isArray(drive)) {
      return Promise.all(drive.map(a => this.indexDrive(a, opts)))
    }

    // create our own new Hyperdrive instance
    if (typeof drive === 'string') {
      if (drive in this._drives) {
        drive = this._drives[drive]
      } else {
        drive = await this.Hyperdrive(drive)
      }
    }
    debug('WebDB.indexDrive', drive.url)
    if (!(drive.url in this._drives)) {
      // store and process
      this._drives[drive.url] = drive
      await Indexer.addDrive(this, drive, opts)
    } else {
      await Indexer.indexDrive(this, drive)
    }
  }

  async unindexDrive (drive) {
    if (typeof drive === 'string') {
      drive = await this.Hyperdrive(drive)
    }
    if (drive.url in this._drives) {
      debug('WebDB.unindexDrive', drive.url)
      delete this._drives[drive.url]
      await Indexer.removeDrive(this, drive)
    }
  }

  async indexFile (drive, filepath) {
    if (typeof drive === 'string') {
      const urlp = new URL(drive)
      const origin = urlp.protocol + '//' + urlp.hostname
      if (origin in this._drives) {
        drive = this._drives[origin]
      } else {
        drive = await this.Hyperdrive(origin)
      }
      return this.indexFile(drive, urlp.pathname)
    }
    await Indexer.readAndIndexFile(this, drive, filepath)
  }

  async unindexFile (drive, filepath) {
    if (typeof drive === 'string') {
      const urlp = new URL(drive)
      drive = await this.Hyperdrive(urlp.protocol + '//' + urlp.hostname)
      return this.indexFile(drive, urlp.pathname)
    }
    await Indexer.unindexFile(this, drive, filepath)
  }

  listSources () {
    return Object.keys(this._drives)
  }

  isSource (url) {
    if (!url) return false
    if (url.url) url = url.url // an drive
    return (url in this._drives)
  }

  static list () {
    // TODO
  }

  static delete (name) {
    if (typeof BrowserLevel.destroy !== 'function') {
      throw new Error('Cannot .delete() databases outside of the browser environment. You should just delete the files manually.')
    }

    // delete the database from indexeddb
    return new Promise((resolve, reject) => {
      BrowserLevel.destroy(name, err => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
}
module.exports = WebDB

