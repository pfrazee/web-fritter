const websocketStream = require('websocket-stream')
const JRPC = require('json-rpc-on-a-stream')

let ctrl

exports.setup = () => {
  const url = `${location.protocol === 'http:' ? 'ws' : 'wss'}://${location.hostname}${location.port ? ':' + location.port : ''}`
  const ws = websocketStream(url)
  ctrl = new JRPC(ws)
}

exports.drive = async (key) => {
  key = /([0-9a-f]{64})/i.exec(key)[0]
  const drive = {key, url: `hyper://${key}`, version: 0, writable: false}
  async function update () {
    const info = ctrl.request('getInfo', [key])
    drive.version = info.version
  }
  drive.update = update
  ;['mkdir', 'writeFile', 'unlink', 'readdir', 'readFile', 'history'].forEach(method => {
    drive[method] = async (...args) => {
      const res = await ctrl.request(method, [key, ...args])
      await update()
      return res
    }
  })
  await update()
  return drive
}