const { EventEmitter } = require('events')
const fs = require('fs')
const net = require('net')

class HRPCServer extends EventEmitter {
  constructor (Session, server, onclient) {
    super()
    if (onclient) this.on('client', onclient)
    this.clients = new Set()
    this.server = server
    this.server.on('connection', (rawSocket) => {
      const client = new Session(rawSocket)
      this.clients.add(client)
      client.on('close', () => this.clients.delete(client))
      this.emit('client', client)
    })
    this.server.on('listening', () => this.emit('listening'))
    this.server.on('close', () => this.emit('close'))
    this.server.on('error', (err) => this.emit('error', err))
  }

  close () {
    return new Promise((resolve, reject) => {
      const done = (err) => {
        this.server.removeListener('error', done)
        this.server.removeListener('close', done)
        if (err) return reject(err)
        resolve()
      }

      this.server.on('close', done)
      this.server.on('error', done)

      this.server.close()
      for (const client of this.clients) client.destroy()
    })
  }

  listen (addr) {
    return new Promise((resolve, reject) => {
      const done = (err) => {
        this.server.removeListener('error', done)
        this.server.removeListener('listening', done)
        if (err) return reject(err)
        resolve()
      }

      this.server.on('error', done)
      this.server.on('listening', done)

      if (typeof addr === 'string') listenSocket(this.server, addr)
      else this.server.listen(addr)
    })
  }
}

module.exports = class HRPC extends EventEmitter {
  static createServer (src, onclient) {
    if (typeof src === 'function') {
      onclient = src
      src = null
    }
    const server = isEventEmitter(src) ? src : net.createServer()
    return new HRPCServer(this, server, onclient)
  }

  static connect (dest) {
    const socket = isEventEmitter(dest) ? dest : net.connect(dest)
    return new this(socket)
  }
}

function isEventEmitter (o) {
  return typeof o === 'object' && o !== null && typeof o.on === 'function'
}

function listenSocket (server, name) {
  fs.unlink(name, () => {
    server.listen(name)
  })
}
