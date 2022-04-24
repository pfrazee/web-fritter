const varint = require('varint')
const { BJSON } = require('nanomessage')
const { NRPC_ERR_ENCODE, NRPC_ERR_DECODE } = require('./errors')

function writeNumber (value, dest) {
  varint.encode(value, dest.buf, dest.offset)
  dest.offset += varint.encode.bytes
}

function writeCodec (enc, length, value, dest) {
  writeNumber(length, dest)
  enc.encode(value, dest.buf, dest.offset)
  dest.offset += length
}

function writeString (value, length, dest) {
  writeNumber(length, dest)
  dest.buf.write(value, dest.offset, length, 'utf8')
  dest.offset += length
}

function readNumber (source) {
  const num = varint.decode(source.buf, source.offset)
  source.offset += varint.decode.bytes
  return num
}

function readCodec (enc, source) {
  const length = readNumber(source)
  const buf = enc.decode(source.buf, source.offset, source.offset + length)
  source.offset += length
  return buf
}

function readBuffer (source) {
  const length = readNumber(source)
  const buf = source.buf.slice(source.offset, source.offset + length)
  source.offset += length
  return buf
}

const ATTR_RESPONSE = 1
const ATTR_EVENT = 1 << 1
const ATTR_ERROR = 1 << 2

class Codec {
  constructor (valueEncoding = BJSON) {
    this._valueEncoding = valueEncoding
    this._lastHeader = null
    this._lastDataLength = null
    this._lastNameLength = null
  }

  encode (obj, buf, offset = 0) {
    try {
      if (obj.name) {
        return this._encodeRequest(obj, buf, offset)
      }

      return this._encodeResponse(obj, buf, offset)
    } catch (_err) {
      const err = new NRPC_ERR_ENCODE(_err.message)
      err.stack = _err.stack || err.stack
      throw _err
    }
  }

  decode (buf, offset = 0) {
    try {
      const header = varint.decode(buf, offset)
      offset += varint.decode.bytes

      if (header & ATTR_RESPONSE) {
        return this._decodeResponse(header, buf, offset)
      }

      return this._decodeRequest(header, buf, offset)
    } catch (_err) {
      const err = new NRPC_ERR_DECODE(_err.message)
      err.stack = _err.stack || err.stack
      throw _err
    }
  }

  encodingLength (obj) {
    if (obj.name) {
      return this._encodingLengthRequest(obj)
    }

    return this._encodingLengthResponse(obj)
  }

  _headerRequest (obj) {
    let header = 0
    if (obj.event) header = header | ATTR_EVENT
    this._lastHeader = header
    return header
  }

  _headerResponse (obj) {
    let header = 0
    header = header | ATTR_RESPONSE
    if (obj.error) header = header | ATTR_ERROR
    this._lastHeader = header
    return header
  }

  _encodeRequest (obj, buf, offset) {
    const result = { buf, offset }
    writeNumber(this._lastHeader, result)
    writeString(obj.name, this._lastNameLength, result)
    writeCodec(this._valueEncoding, this._lastDataLength, obj.data, result)
    return result.buf
  }

  _decodeRequest (header, buf, offset) {
    const obj = {}
    const result = { buf, offset }
    obj.event = !!(header & ATTR_EVENT)
    obj.name = readBuffer(result).toString()
    obj.data = readCodec(this._valueEncoding, result)
    return obj
  }

  _encodingLengthRequest (obj) {
    const header = this._headerRequest(obj)
    this._lastDataLength = this._valueEncoding.encodingLength(obj.data)
    this._lastNameLength = Buffer.byteLength(obj.name, 'utf8')
    return (
      varint.encodingLength(header) +
      varint.encodingLength(this._lastDataLength) +
      this._lastDataLength +
      varint.encodingLength(this._lastNameLength) +
      this._lastNameLength
    )
  }

  _encodingLengthResponse (obj) {
    const header = this._headerResponse(obj)
    let codec = this._valueEncoding
    if (obj.error) codec = BJSON

    const dataLength = codec.encodingLength(obj.data)
    return (
      varint.encodingLength(header) +
      varint.encodingLength(dataLength) +
      dataLength
    )
  }

  _encodeResponse (obj, buf, offset) {
    let codec = this._valueEncoding
    if (obj.error) codec = BJSON

    const dataLength = codec.encodingLength(obj.data)

    const result = { buf, offset }
    writeNumber(this._lastHeader, result)
    writeCodec(codec, dataLength, obj.data, result)
    return result.buf
  }

  _decodeResponse (header, buf, offset) {
    const obj = {}
    const result = { buf, offset }
    obj.error = !!(header & ATTR_ERROR)

    let codec = this._valueEncoding
    if (obj.error) codec = BJSON

    obj.data = readCodec(codec, result)
    return obj
  }
}

module.exports = Codec
