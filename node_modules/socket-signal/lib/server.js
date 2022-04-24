/**
 * @typedef {object} Data
 * @property {Buffer} id
 * @property {Buffer} topic
 * @property {Object} metadata
*/

/**
 * @typedef {object} SignalData
 * @extends Data
 * @property {Buffer} remoteId
 * @property {Buffer} sessionId
 * @property {Array<Object>} data
*/

const crypto = require('crypto')
const nanomessagerpc = require('nanomessage-rpc')

const { NanoresourcePromise } = require('nanoresource-promise/emitter')
const log = require('debug')('socketsignal:server')

const kDefineActions = Symbol('socketsignal.defineactions')
const kDefineEvents = Symbol('socketsignal.defineevents')

class SocketSignalServer extends NanoresourcePromise {
  constructor (opts = {}) {
    super()

    const { onConnect, onDisconnect, onJoin, onLeave, onLookup, onOffer, onSignal, requestTimeout = 10 * 1000, ...rpcOpts } = opts

    if (onConnect) this._onConnect = onConnect
    if (onDisconnect) this._onDisconnect = onDisconnect
    if (onJoin) this._onJoin = onJoin
    if (onLeave) this._onLeave = onLeave
    if (onLookup) this._onLookup = onLookup
    if (onOffer) this._onOffer = onOffer
    if (onSignal) this._onSignal = onSignal

    this._requestTimeout = requestTimeout
    this._rpcOpts = rpcOpts

    this.connections = new Set()
  }

  /**
   * Adds a duplex stream socket
   *
   * @param {DuplexStream} socket
   * @returns {NanomessageRPC}
   */
  async addSocket (socket) {
    await this.open()

    const rpc = nanomessagerpc({ timeout: this._requestTimeout, ...this._rpcOpts, ...nanomessagerpc.useSocket(socket) })

    this[kDefineActions](rpc)
    this[kDefineEvents](rpc)

    rpc.id = crypto.randomBytes(32)
    rpc.socket = socket

    const deleteConnection = () => {
      if (this.connections.delete(rpc)) {
        log('connection-deleted', rpc.id.toString('hex'))
        return this._onDisconnect(rpc)
      }
    }

    rpc.ee.on('closed', deleteConnection)

    rpc.ee.on('error', err => this.emit('connection-error', err, rpc))

    await rpc.open()

    try {
      log('connection-added', rpc.id.toString('hex'))
      await this._onConnect(rpc)
      this.connections.add(rpc)
    } catch (err) {
      rpc.closed()
        .then(deleteConnection)
        .catch(deleteConnection)
        .finally(() => {
          this.emit('connection-error', err, rpc)
        })
    }

    return rpc
  }

  /**
   * Defines a behaviour when the nanoresource is opening.
   *
   * @returns {Promise}
   */
  async _open () {}

  /**
   * Defines a behaviour when the nanoresource is closing.
   *
   * @returns {Promise}
   */
  async _close () {
    await Promise.all(Array.from(this.connections.values()).map(c => c.close()))
  }

  /**
   * Event connect
   *
   * @abstract
   * @param {NanomessageRPC} rpc
   */
  async _onConnect () {}

  /**
   * Event disconnect
   *
   * @abstract
   * @param {NanomessageRPC} rpc
   */
  async _onDisconnect () {}

  /**
   * Action join
   *
   * @abstract
   * @param {NanomessageRPC} rpc
   * @param {Data} data
   * @returns {Promise<Array<Buffer>>}
   */
  async _onJoin () {}

  /**
   * Action leave
   *
   * @abstract
   * @param {NanomessageRPC} rpc
   * @param {Data} data
   * @returns {Promise}
   */
  async _onLeave () {}

  /**
   * Action lookup
   *
   * @abstract
   * @param {NanomessageRPC} rpc
   * @param {Data} data
   * @returns {Promise<Array<Buffer>>}
   */
  async _onLookup () {}

  /**
   * Action offer
   *
   * @abstract
   * @param {NanomessageRPC} rpc
   * @param {SignalData} data
   * @returns {Promise<SignalData>}
   */
  async _onOffer () {}

  /**
   * Event signal
   *
   * @abstract
   * @param {NanomessageRPC} rpc
   * @param {SignalData} data
   */
  async _onSignal () {}

  /**
   * @private
   */
  [kDefineActions] (rpc) {
    rpc.actions({
      join: (data = {}) => {
        return this._onJoin(rpc, data)
      },
      leave: (data = {}) => {
        return this._onLeave(rpc, data)
      },
      offer: (data = {}) => {
        return this._onOffer(rpc, data)
      },
      lookup: (data = {}) => {
        return this._onLookup(rpc, data)
      }
    })
  }

  /**
   * @private
   */
  [kDefineEvents] (rpc) {
    rpc.on('signal', async (data = {}) => {
      try {
        await this._onSignal(rpc, data)
      } catch (err) {
        log('signal error', err)
      }
    })
  }
}

module.exports = SocketSignalServer
