const varint = require('varint')
const BJSON = require('./buffer-json')
const { NMSG_ERR_ENCODE, NMSG_ERR_DECODE } = require('./errors')

const ATTR_RESPONSE = 1

module.exports = function createCodec (valueEncoding = BJSON) {
  return {
    encode (info) {
      try {
        let header = info.id << 1
        if (info.response) header = header | ATTR_RESPONSE
        const dataLength = valueEncoding.encodingLength(info.data)
        const buf = Buffer.allocUnsafe(varint.encodingLength(header) + varint.encodingLength(dataLength) + dataLength)
        let offset = 0
        varint.encode(header, buf, offset)
        offset += varint.encode.bytes
        varint.encode(dataLength, buf, offset)
        offset += varint.encode.bytes
        valueEncoding.encode(info.data, buf, offset)
        return buf
      } catch (err) {
        throw new NMSG_ERR_ENCODE(err.message)
      }
    },

    decode (buf) {
      try {
        const request = {}
        let offset = 0
        const header = varint.decode(buf, offset)
        offset += varint.decode.bytes
        const dataLength = varint.decode(buf, offset)
        offset += varint.decode.bytes
        request.data = valueEncoding.decode(buf, offset, offset + dataLength)
        request.response = !!(header & ATTR_RESPONSE)
        request.id = header >> 1
        return request
      } catch (err) {
        throw new NMSG_ERR_DECODE(err.message)
      }
    }
  }
}
