const { NanoresourcePromise } = require('nanoresource-promise/emitter')
const SimplePeer = require('simple-peer')
const assert = require('nanocustomassert')
const pEvent = require('p-event')
const eos = require('end-of-stream')

const SignalBatch = require('./signal-batch')
const { ERR_CONNECTION_CLOSED, ERR_SIGNAL_TIMEOUT } = require('./errors')

const kMetadata = Symbol('peer.metadata')
const kLocalMetadata = Symbol('peer.localmetadata')
const kOnSignal = Symbol('peer.onsignal')
const kOffer = Symbol('peer.offer')

module.exports = class Peer extends NanoresourcePromise {
  constructor (opts = {}) {
    super()

    const { onSignal, initiator, sessionId, id, topic, metadata, localMetadata, simplePeer = {}, timeout } = opts

    assert(onSignal)
    assert(initiator !== undefined, 'initiator is required')
    assert(Buffer.isBuffer(sessionId) && sessionId.length === 32, 'sessionId is required and must be a buffer of 32')
    assert(Buffer.isBuffer(id) && id.length === 32, 'id is required and must be a buffer of 32')
    assert(Buffer.isBuffer(topic) && topic.length === 32, 'topic must be a buffer of 32')
    assert(!metadata || typeof metadata === 'object', 'metadata must be an object')
    assert(!localMetadata || typeof localMetadata === 'object', 'localMetadata must be an object')

    this.initiator = initiator
    this.sessionId = sessionId
    this.id = id
    this.topic = topic
    this.simplePeerOptions = simplePeer
    this.timeout = timeout

    this.subscribeMediaStream = false
    this.error = null
    this.signals = []

    this[kOnSignal] = onSignal
    this[kOffer] = null
    this[kMetadata] = metadata
    this[kLocalMetadata] = localMetadata
    this.once('error', err => {
      this.error = err
    })

    this._initializeSimplePeer()
  }

  get connected () {
    return this.stream.connected
  }

  get destroyed () {
    return this.stream.destroyed
  }

  get metadata () {
    return this[kMetadata]
  }

  set metadata (metadata) {
    assert(!metadata || typeof metadata === 'object', 'metadata must be an object')
    this[kMetadata] = metadata
    this.emit('metadata-updated', this[kMetadata])
    return this[kMetadata]
  }

  get localMetadata () {
    return this[kLocalMetadata]
  }

  set localMetadata (metadata) {
    assert(!metadata || typeof metadata === 'object', 'localMetadata must be an object')
    this[kLocalMetadata] = metadata
    this.emit('local-metadata-updated', this[kLocalMetadata])
    return this[kLocalMetadata]
  }

  async ready () {
    if (this.connected) return
    if (this.destroyed) {
      if (this.error) throw this.error
      throw new ERR_CONNECTION_CLOSED()
    }
    return pEvent(this, 'connect', {
      rejectionEvents: ['error', 'close']
    })
  }

  addStream (mediaStream) {
    return this.ready()
      .then(() => this.stream.addStream(mediaStream))
  }

  removeStream (mediaStream) {
    return this.ready()
      .then(() => this.stream.removeStream(mediaStream))
  }

  destroy (err) {
    this.stream.destroy(err)
  }

  open (offer) {
    if (offer) this[kOffer] = offer
    return super.open()
  }

  async _open () {
    const timeout = setTimeout(() => {
      this.destroy(new ERR_SIGNAL_TIMEOUT(this.signals))
    }, this.timeout)

    const signalBatch = new SignalBatch()

    const ready = this.ready()

    const onSignal = signal => signalBatch.add(signal)
    const clean = () => this.stream.removeListener('signal', onSignal)
    this.once('close', () => clean())

    signalBatch
      .onSignal(batch => {
        this.signals = [...this.signals, ...batch]
        return this[kOnSignal](this, batch)
      })
      .onClose((err) => {
        clean()
        if (err) process.nextTick(() => this.destroy(err))
      })
      .resolution(() => this.destroyed)

    this.stream.on('signal', onSignal)

    if (!this.initiator && this[kOffer]) {
      this[kOffer].forEach(signal => this.stream.signal(signal))
    }

    return ready.finally(() => {
      clearTimeout(timeout)
    })
  }

  _close () {
    if (this.destroyed) return
    process.nextTick(() => this.stream.destroy())
    return new Promise(resolve => eos(this.stream, () => resolve()))
  }

  _initializeSimplePeer () {
    const { streams = [], ...opts } = this.simplePeerOptions
    this.stream = new SimplePeer({ ...opts, initiator: this.initiator })
    streams.forEach(stream => this.addStream(stream).catch(() => {}))

    // close stream support
    this.stream.close = () => process.nextTick(() => this.stream.destroy())

    const onStream = eventStream => this.emit('stream', eventStream)
    const onSignal = signal => this.emit('signal', signal)
    const onError = err => this.emit('error', err)
    const onConnect = () => this.emit('connect')
    const onClose = () => {
      this.stream.removeListener('stream', onStream)
      this.stream.removeListener('signal', onSignal)
      this.stream.removeListener('error', onError)
      this.stream.removeListener('connect', onConnect)
      this.close().catch(() => {})
      this.emit('close')
    }

    this.stream.on('stream', onStream)
    this.stream.on('signal', onSignal)
    this.stream.once('error', onError)
    this.stream.once('connect', onConnect)
    this.stream.once('close', onClose)
  }
}
