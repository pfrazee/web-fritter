const express = require("express")
const WebSocket = require('ws')
const websocketStream = require('websocket-stream/stream');
const JRPC = require('json-rpc-on-a-stream')

const app = express();
const port = process.env.PORT || 5001;

const websocketServer = new WebSocket.Server({
  noServer: true,
  path: "/",
});
app.use('/', express.static('.', {fallthrough: true}))
app.use((req, res, next) => {
  res.sendFile(__dirname + '/index.html')
})
const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}\n\n`);
});

server.on("upgrade", (request, socket, head) => {
  websocketServer.handleUpgrade(request, socket, head, (websocket) => {
    websocketServer.emit("connection", websocket, request);
  });
});

const memdrives = new Map()
function getDrive (key) {
  if (typeof key !== 'string') throw new Error('invalid key')
  if (!memdrives.get(key)) {
    memdrives.set(key, new MemHyperdrive(key))
  }
  return memdrives.get(key)
}

websocketServer.on("connection", (sock, req) => {
  const s = websocketStream(sock)
  s.on('error', console.log)
  console.log('new conn')
  ctrl = new JRPC(s)
  
  ctrl.respond('getInfo', ([key, ...args]) => {
    return getDrive(key).getInfo()
  })
  ctrl.respond('mkdir', ([key, ...args]) => {
    return getDrive(key).mkdir(...args)
  })
  ctrl.respond('writeFile', ([key, ...args]) => {
    return getDrive(key).writeFile(...args)
  })
  ctrl.respond('unlink', ([key, ...args]) => {
    return getDrive(key).unlink(...args)
  })
  ctrl.respond('readdir', ([key, ...args]) => {
    return getDrive(key).readdir(...args)
  })
  ctrl.respond('readFile', ([key, ...args]) => {
    return getDrive(key).readFile(...args)
  })
  ctrl.respond('history', ([key, ...args]) => {
    return getDrive(key).history(...args)
  })
})


function normalizePath (path) {
  if (typeof path !== 'string') throw new Error('invalid path')
  if (!path.startsWith('/')) path = `/${path}`
  while (path !== '/' && path.endsWith('/')) path = path.slice(0, -1)
  return path
}

class MemHyperdrive {
  constructor (key) {
    this.key = key
    this.version = 0
    this.files = new Map()
    this._history = []
  }

  getInfo () {
    return {
      key: this.key,
      url: `hyper://${this.key}`,
      version: this.version
    }
  }

  async mkdir (path) {
    path = normalizePath(path)
    if (this.files.has(path)) {
      throw new Error('Already exists')
    }
    const seq = this.version++
    this.files.set(path, {folder: true, seq})
    this._history.push({type: 'put', path, seq})
  }

  async writeFile (path, data, opts) {
    const seq = this.version++
    this.files.set(normalizePath(path), {file: true, data, seq})
    this._history.push({type: 'put', path, seq})
  }

  async unlink (path) {
    const seq = this.version++
    this.files.delete(normalizePath(path))
    this._history.push({type: 'del', path, seq})
  }

  async readdir (pathPattern, opts) {
    pathPattern = normalizePath(pathPattern)
    const hits = []
    for (const [path, entry] of this.files.entries()) {
      if (path.startsWith(pathPattern)) {
        if (!(opts && opts.recursive)) {
          if (path.slice(pathPattern.length).indexOf('/') !== -1) {
            continue
          }
        }
        hits.push({path})
      }
    }
    return hits
  }

  async readFile (path, opts) {
    const entry = this.files.get(normalizePath(path))
    if (!entry) throw new Error('Not found')
    if (!entry.file) throw new Error('Not a file')
    return entry.data
  }

  async history (start = 0) {
    return this._history.slice(start)
  }
}

/*

let idCounter = 0
const socks = new Map()
const swarms = new Map()
websocketServer.on("connection", (sock, req) => {
  const s = websocketStream(sock)
  s.on('error', console.log)
  const multi = multiplex()
  multi.on('error', console.log)
  multi.pipe(s).pipe(multi)
  multi.__id = ++idCounter
  console.log('new conn', multi.__id)
  ctrl = new JRPC(multi.createSharedStream('ctrl'))
  socks.set(multi.__id, {multi, ctrl})

  ctrl.respond('join', (key) => {
    try {
      console.log('join received', key)
      let swarm = swarms.get(key) || new Set()
      swarm.add(multi.__id)
      swarms.set(key, swarm)

      let streamIds = []
      for (let other of socks.values()) {
        if (other.multi.__id === multi.__id) continue

        const [loId, hiId] = [Math.min(multi.__id, other.multi.__id), Math.max(multi.__id, other.multi.__id)]
        const streamId = `${loId}:${hiId}:${key}`
        other.ctrl.event('join', {id: multi.__id, key, streamId})
        console.log('streamId', streamId)
        const s1 = other.multi.createSharedStream(streamId)
        const s2 = multi.createSharedStream(streamId)
        s1.on('error', console.log)
        s2.on('error', console.log)
        console.log(`piping`, streamId, 'for', multi.__id)
        s1.pipe(s2).pipe(s1)
        streamIds.push(streamId)
      }

      return {streamIds}
    } catch (e) {
      console.log(e)
      throw e
    }
  })
})
*/