# socket-signal-websocket

[![Build Status](https://travis-ci.com/geut/socket-signal-websocket.svg?branch=master)](https://travis-ci.com/geut/socket-signal-websocket)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

> socket-signal through simple-websocket and reconnecting support

## <a name="install"></a> Install

```
$ npm install socket-signal-websocket
```

## <a name="usage"></a> Usage

### Server

```
$ npx socket-signal-websocket [--port=4000]
```

### Client

```javascript
const { SocketSignalWebsocketClient } = require('socket-signal-websocket')

// you can define multiple server urls for fallback reconnections
const client = new SocketSignalWebsocketClient([
  'ws://localhost:4000',
  'ws://localhost:4001',
  'ws://localhost:4002'
], {
  heartbeat: {
    interval: 10 * 1000,
    timeout: 5 * 1000
  },
  simpleWebsocket: {}, // https://github.com/feross/simple-websocket options
  reconnectingWebsocket: {}, // https://github.com/pladaria/reconnecting-websocket options
  simplePeer: {} // https://github.com/feross/simple-peer options
})

;(async () => {
  await client.open()

  client.onIncomingPeer(async (peer) => {
    if (validPeer(peer)) return
    throw new Error('invalid peer')
  })

  const peersForThatTopic = await client.join(topic)

  const remotePeer = client.connect(topic, peersForThatTopic[0])

  try {
    await remotePeer.ready()
    // SimplePeer connected
  } catch(err) {
    // SimplePeer rejected
  }
})()
```

## <a name="issues"></a> Issues

:bug: If you found an issue we encourage you to report it on [github](https://github.com/geut/socket-signal-websocket/issues). Please specify your OS and the actions to reproduce it.

## <a name="contribute"></a> Contributing

:busts_in_silhouette: Ideas and contributions to the project are welcome. You must follow this [guideline](https://github.com/geut/socket-signal-websocket/blob/master/CONTRIBUTING.md).

## License

MIT © A [**GEUT**](http://geutstudio.com/) project
