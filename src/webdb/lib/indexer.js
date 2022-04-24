const flatten = require('lodash.flatten')
const anymatch = require('anymatch')
const concat = require('concat-stream')
const LevelUtil = require('./util-level')
const {debug, veryDebug, lock, checkoutDrive} = require('./util')

const READ_TIMEOUT = 30e3

// exported api
// =

exports.addDrive = async function (db, drive, {watch}) {
  veryDebug('Indexer.addDrive', drive.url, {watch})

  // process the drive
  await (
    indexDrive(db, drive)
      .then(() => {
        if (watch) exports.watchDrive(db, drive)
      })
      .catch(e => onFailInitialIndex(e, db, drive, {watch}))
  )
}

exports.removeDrive = async function (db, drive) {
  veryDebug('Indexer.removeDrive', drive.url)
  await unindexDrive(db, drive)
  exports.unwatchDrive(db, drive)
}

exports.watchDrive = async function (db, drive) {
  veryDebug('Indexer.watchDrive', drive.url)
  if (drive.fileEvents) {
    console.error('watchDrive() called on drive that already is being watched', drive.url)
    return
  }
  // autoindex on changes
  // TODO debounce!!!!
  drive.on('update', () => {
    indexDrive(db, drive)
  })
}

exports.unwatchDrive = function (db, drive) {
  veryDebug('Indexer.unwatchDrive', drive.url)
  if (drive.fileEvents) {
    drive.fileEvents.close()
    drive.fileEvents = null
  }
}

exports.resetOutdatedIndexes = async function (db, neededRebuilds) {
  if (neededRebuilds.length === 0) {
    return false
  }
  debug(`Indexer.resetOutdatedIndexes need to rebuild ${neededRebuilds.length} tables`)
  veryDebug('Indexer.resetOutdatedIndexes tablesToRebuild', neededRebuilds)

  // clear tables
  // TODO go per-table
  const tables = db.tables
  for (let i = 0; i < tables.length; i++) {
    let table = tables[i]
    veryDebug('clearing', table.name)
    // clear indexed data
    await LevelUtil.clear(table.level)
  }

  // reset meta records
  var promises = []
  await LevelUtil.each(db._indexMetaLevel, indexMeta => {
    indexMeta.version = 0
    promises.push(db._indexMetaLevel.put(indexMeta.url, indexMeta))
  })
  await Promise.all(promises)

  return true
}

// figure how what changes need to be processed
// then update the indexes
async function indexDrive (db, drive) {
  debug('Indexer.indexDrive', drive.url)
  var release = await lock(`index:${drive.url}`)
  try {
    // sanity check
    if (!db.isOpen && !db.isBeingOpened) {
      return
    }
    if (!db.level) {
      return console.log('indexDrive called on corrupted db')
    }

    // fetch the current state of the drive's index
    var indexMeta = await db._indexMetaLevel.get(drive.url).catch(e => null)
    indexMeta = indexMeta || {version: 0}
    try {
      db.emit('source-indexing', drive.url, indexMeta.version, drive.version)
    } catch (e) {
      console.error(e)
    }

    // has this version of the drive been processed?
    if (indexMeta && indexMeta.version >= drive.version) {
      debug('Indexer.indexDrive no index needed for', drive.url)
      try {
        db.emit('source-indexed', drive.url, drive.version)
      } catch (e) {
        console.error(e)
      }
      return // yes, stop
    }
    debug('Indexer.indexDrive', drive.url, 'start', indexMeta.version, 'end', drive.version)

    // find and apply all changes which haven't yet been processed
    var updates = await scanDriveHistoryForUpdates(db, drive, {
      start: indexMeta.version + 1,
      end: drive.version + 1
    })
    await applyUpdates(db, drive, updates)
    debug('Indexer.indexDrive applied', updates.length, 'updates from', drive.url)

    // emit
    try {
      db.emit('source-indexed', drive.url, drive.version)
      db.emit('indexes-updated', drive.url, drive.version)
    } catch (e) {
      console.error(e)
    }
  } finally {
    release()
  }
}
exports.indexDrive = indexDrive

// delete all records generated from the drive
async function unindexDrive (db, drive) {
  var release = await lock(`index:${drive.url}`)
  try {
    // find any relevant records and delete them from the indexes
    var recordMatches = await scanDriveForRecords(db, drive)
    await Promise.all(recordMatches.map(match => match.table.level.del(match.recordUrl)))
    await db._indexMetaLevel.del(drive.url)
  } finally {
    release()
  }
}
exports.unindexDrive = unindexDrive

// read the file, find the matching table, validate, then store
async function readAndIndexFile (db, drive, filepath, version = false) {
  const tables = db.tables
  const fileUrl = drive.url + filepath
  try {
    // read file
    var record = JSON.parse(await drive.readFile(filepath, {encoding: 'utf8', timeout: READ_TIMEOUT}))

    // index on the first matching table
    for (var i = 0; i < tables.length; i++) {
      let table = tables[i]
      if (table.isRecordFile(filepath)) {
        // validate
        let isValid = true
        if (table.schema.validate) {
          try { isValid = table.schema.validate(record) }
          catch (e) {
              console.error(e);
              isValid = false
          }
        }
        if (isValid) {
          // run preprocessor
          if (table.schema.preprocess) {
            let newRecord = table.schema.preprocess(record)
            if (newRecord) record = newRecord
          }
          // save
          let obj = {
            url: fileUrl,
            origin: drive.url,
            indexedAt: Date.now(),
            record
          }
          await table.level.put(fileUrl, obj)
          try { table.emit('put-record', obj) } catch (e) { console.error(e) }
        } else {
          // delete
          await table.level.del(fileUrl)
          try {
            table.emit('del-record', {
              url: fileUrl,
              origin: drive.url,
              indexedAt: Date.now()
            })
          } catch (e) { console.error(e) }
        }
      }
    }
  } catch (e) {
    console.log('Failed to index', fileUrl, e)
    throw e
  }
}
exports.readAndIndexFile = readAndIndexFile

async function unindexFile (db, drive, filepath) {
  const tables = db.tables
  const fileUrl = drive.url + filepath
  try {
    // unindex on the first matching table
    for (var i = 0; i < tables.length; i++) {
      let table = tables[i]
      if (table.isRecordFile(filepath)) {
        await table.level.del(fileUrl)
        try {
          table.emit('del-record', {
            url: fileUrl,
            origin: drive.url,
            indexedAt: Date.now()
          })
        } catch (e) { console.error(e) }
      }
    }
  } catch (e) {
    console.log('Failed to unindex', fileUrl, e)
  }
}
exports.unindexFile = unindexFile

// internal methods
// =

// helper for when the first indexDrive() fails
// emit an error, and (if it's a timeout) keep looking for the drive
async function onFailInitialIndex (e, db, drive, {watch}) {
  if (e.name === 'TimeoutError') {
    debug('Indexer.onFailInitialIndex starting retry loop', drive.url)
    db.emit('source-missing', drive.url)
    while (true) {
      veryDebug('Indexer.onFailInitialIndex attempting load', drive.url)
      // try again every 30 seconds
      await new Promise(resolve => setTimeout(resolve, 30e3))
      // still a source?
      if (!db.isOpen || !(drive.url in db._drives)) {
        return
      }
      // re-attempt the index
      try {
        await indexDrive(db, drive)
        veryDebug('Indexer.onFailInitialIndex successfully loaded', drive.url)
        break // made it!
      } catch (e) {
        // abort if we get a non-timeout error
        if (e.name !== 'TimeoutError') {
          veryDebug('Indexer.onFailInitialIndex failed attempt, aborting', drive.url, e)
          return
        }
      }
    }
    // success
    db.emit('source-found', drive.url)
    if (watch) exports.watchDrive(db, drive)
  } else {
    db.emit('source-error', drive.url, e)
  }
}

// look through the given history slice
// match against the tables' path patterns
// return back the *latest* change to each matching changed record, as an array ordered by revision
async function scanDriveHistoryForUpdates (db, drive, {start, end}) {
  // var history = await drive.history({start, end, timeout: READ_TIMEOUT})
  var history = await new Promise((resolve, reject) => {
    const s = drive.createDiffStream(start)
    s.on('error', reject)
    s.pipe(concat(resolve))
  })

  // pull the latest update to each file
  var updates = {}
  history.forEach(update => {
    update.name = `/${update.name}`
    if (anymatch(db._tableFilePatterns, update.name)) {
      updates[update.name] = update
    }
  })

  // return an array ordered by version
  return Object.values(updates).sort((a, b) => a.seq - b.seq)
}

// look through the drive for any files that generate records
async function scanDriveForRecords (db, drive) {
  var recordFiles = await Promise.all(db.tables.map(table => {
    return table.listRecordFiles(drive)
  }))
  return flatten(recordFiles)
}

// iterate the updates and apply them one by one, updating the metadata as each is applied successfully
async function applyUpdates (db, drive, updates) {
  for (let i = 0; i < updates.length; i++) {
    // process update
    var update = updates[i]
    if (update.type === 'del') {
      await unindexFile(db, drive, update.name)
    } else {
      await readAndIndexFile(db, drive, update.name, update.seq)
    }

    // update meta
    await LevelUtil.update(db._indexMetaLevel, drive.url, {
      url: drive.url,
      version: update.seq // record the version we've indexed
    })
    try {
      db.emit('source-index-progress', drive.url, (i + 1), updates.length)
    } catch (e) {
      console.error(e)
    }
  }
}
