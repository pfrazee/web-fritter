const { NanoresourcePromise } = require('nanoresource-promise/emitter')
const fastq = require('fastq')

const Request = require('./request')
const createCodec = require('./codec')
const { NMSG_ERR_CLOSE, NMSG_ERR_NOT_OPEN, NMSG_ERR_RESPONSE } = require('./errors')
const IdGenerator = require('./id-generator')

const kRequests = Symbol('nanomessage.requests')
const kInQueue = Symbol('nanomessage.inqueue')
const kOutQueue = Symbol('nanomessage.outqueue')
const kUnsubscribe = Symbol('nanomessage.unsubscribe')
const kOpen = Symbol('nanomessage.open')
const kClose = Symbol('nanomessage.close')
const kFastCheckOpen = Symbol('nanomessage.fastcheckopen')
const kTimeout = Symbol('nanomessage.timeout')
const kIdGenerator = Symbol('nanomessage.idgenerator')
const kCodec = Symbol('nanomessage.codec')

function inWorker (info, done) {
  this[kFastCheckOpen]()
    .then(() => this._onMessage(info.data, info))
    .then(data => {
      if (this.closed || this.closing) return done()

      info.responseData = data

      return this._send(this[kCodec].encode({
        id: info.id,
        response: info.response,
        data
      }), info)
    })
    .then(() => done())
    .catch(err => done(err))
}

function outWorker (request, done) {
  const info = request.info()
  this[kFastCheckOpen]()
    .then(() => {
      if (request.finished) return
      request.start()
      return this._send(this[kCodec].encode(info), info)
    })
    .then(() => {
      if (request.finished) return
      return request.promise
    })
    .then(data => done(null, data))
    .catch(err => done(err))
}

class Nanomessage extends NanoresourcePromise {
  /**
   * Creates an instance of Nanomessage.
   * @param {Object} [opts={}]
   * @param {(buf: Buffer, info: Object) => Promise|undefined} [opts.send]
   * @param {function} [opts.subscribe]
   * @param {(data: Object, info: Object) => Promise<*>} [opts.onMessage]
   * @param {function} [opts.open]
   * @param {function} [opts.close]
   * @param {number} [opts.timeout]
   * @param {Object} [opts.valueEncoding]
   * @param {({ incoming: number, outgoing: number }|number)} [opts.concurrency]
   * @memberof Nanomessage
   */
  constructor (opts = {}) {
    super()

    const { send, subscribe, onMessage, open, close, timeout, valueEncoding, concurrency = 256 } = opts

    if (send) this._send = send
    if (subscribe) this._subscribe = subscribe
    if (onMessage) this.setMessageHandler(onMessage)
    if (open) this[kOpen] = open
    if (close) this[kClose] = close
    this.setRequestTimeout(timeout)

    this[kCodec] = createCodec(valueEncoding)

    this[kInQueue] = fastq(this, inWorker, 1)
    this[kOutQueue] = fastq(this, outWorker, 1)
    this.setConcurrency(concurrency)

    this[kRequests] = new Map()
    this[kIdGenerator] = new IdGenerator(() => this[kRequests].size + 1)
  }

  /**
   * @readonly
   * @type {Object}
   */
  get codec () {
    return this[kCodec]
  }

  /**
   * @readonly
   * @type {Array<Request>}
   */
  get requests () {
    return Array.from(this[kRequests].values())
  }

  /**
   * @readonly
   * @type {number}
   */
  get inflightRequests () {
    return this[kOutQueue].running()
  }

  /**
   * @readonly
   * @type {number}
   */
  get requestTimeout () {
    return this[kTimeout]
  }

  /**
   * @readonly
   * @type {Object}
   */
  get concurrency () {
    return {
      incoming: this[kInQueue].concurrency,
      outgoing: this[kOutQueue].concurrency
    }
  }

  /**
   * @param {number} timeout
   * @returns {Nanomessage}
   */
  setRequestTimeout (timeout) {
    this[kTimeout] = timeout
    return this
  }

  /**
   * @param {({ incoming: number, outgoing: number }|number)} value
   * @returns {Nanomessage}
   */
  setConcurrency (value) {
    if (typeof value === 'number') {
      this[kInQueue].concurrency = value
      this[kOutQueue].concurrency = value
    } else {
      this[kInQueue].concurrency = value.incoming || this[kInQueue].concurrency
      this[kOutQueue].concurrency = value.outgoing || this[kOutQueue].concurrency
    }
    return this
  }

  /**
   * Send a request and wait for the response.
   *
   * @param {*} data
   * @param {Object} [opts]
   * @param {number} [opts.timeout]
   * @param {AbortSignal} [opts.signal]
   * @returns {Promise<*>}
   */
  request (data, opts = {}) {
    const request = new Request({ id: this[kIdGenerator].get(), data, timeout: opts.timeout || this[kTimeout], signal: opts.signal })
    const info = request.info()

    this[kRequests].set(request.id, request)
    request.onFinish(() => {
      this[kRequests].delete(request.id)
      this[kIdGenerator].release(request.id)
    })

    this.emit('request-created', info)

    this[kOutQueue].push(request, (err, data) => {
      info.response = true
      info.responseData = data
      this.emit('request-ended', err, info)
    })

    return request.promise
  }

  /**
   * Send a ephemeral message.
   *
   * @param {*} data
   * @returns {Promise}
   */
  send (data) {
    return this[kFastCheckOpen]()
      .then(() => {
        const info = Request.info({ id: 0, data })
        return this._send(this[kCodec].encode(info), info)
      })
  }

  /**
   * @param {(data: Object, info: Object) => Promise<*>} onMessage
   * @returns {Nanomessage}
   */
  setMessageHandler (onMessage) {
    this._onMessage = onMessage
    return this
  }

  /**
   * @param {Buffer} buf
   * @returns {undefined}
   */
  processIncomingMessage (buf) {
    if (this.closed || this.closing) return

    const info = Request.info(this[kCodec].decode(buf))

    // resolve response
    if (info.response) {
      const request = this[kRequests].get(info.id)
      if (request) request.resolve(info.data)
      return
    }

    if (info.ephemeral) {
      this.emit('request-received', info)
      this[kFastCheckOpen]()
        .then(() => this._onMessage(info.data, info))
        .catch(err => {
          const rErr = new NMSG_ERR_RESPONSE(err.message)
          rErr.stack = err.stack || rErr.stack
          this.emit('response-error', rErr, info)
        })
      return
    }

    info.response = true
    this.emit('request-received', info)

    this[kInQueue].push(info, err => {
      if (err) {
        const rErr = new NMSG_ERR_RESPONSE(err.message)
        rErr.stack = err.stack || rErr.stack
        this.emit('response-error', rErr, info)
      }
    })
  }

  /**
   * @abstract
   * @param {Buffer} buf
   * @param {Object} info
   * @returns {Promise|undefined}
   */
  async _send (buf, info) {
    throw new Error('_send not implemented')
  }

  /**
   * @abstract
   * @param {Object} data
   * @param {Object} info
   * @returns {Promise<*>}
   */
  async _onMessage (data, info) {
    throw new Error('_onMessage not implemented')
  }

  async _open () {
    await (this[kOpen] && this[kOpen]())
    this[kUnsubscribe] = this._subscribe && this._subscribe(this.processIncomingMessage.bind(this))
  }

  async _close () {
    if (this[kUnsubscribe]) this[kUnsubscribe]()

    const requestsToClose = []
    this[kRequests].forEach(request => request.reject(new NMSG_ERR_CLOSE()))
    this[kRequests].clear()

    this[kInQueue] && this[kInQueue].kill()
    this[kOutQueue] && this[kOutQueue].kill()

    await (this[kClose] && this[kClose]())
    await Promise.all(requestsToClose)
  }

  async [kFastCheckOpen] () {
    if (this.closed || this.closing) throw new NMSG_ERR_CLOSE()
    if (this.opening) return this.open()
    if (!this.opened) throw new NMSG_ERR_NOT_OPEN()
  }
}

module.exports = Nanomessage
