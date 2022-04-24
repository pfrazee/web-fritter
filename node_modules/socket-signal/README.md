# socket-signal

[![Build Status](https://travis-ci.com/geut/socket-signal.svg?branch=master)](https://travis-ci.com/geut/socket-signal)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

> Signal abstraction to create WebRTC connections through sockets.

This module provides a common interface (for the client and server) to build your own signal.

If you want to use a `ready to use` implementation check: [socket-signal-websocket](https://github.com/geut/socket-signal-websocket).

## <a name="install"></a> Install

```
$ npm install socket-signal
```

## <a name="usage"></a> Usage

### Client

The client interface provides almost everything that you need to start a basic signal client (most of the times you won't need to add more features).

```javascript
const { SocketSignalClient } = require('socket-signal')

class YourClient extends SocketSignalClient {
  async _open() {
    await super._open()
  }

  async _close() {
    await super._close()
  }

  async _onOffer(data) {
    // data.offer
  }

  async _onAnswer(data) {
    // data.answer
  }

  async _onIncomingPeer(peer) {
    if (validPeer(peer)) return
    throw new Error('invalid peer')
  }
}

const client = new YourClient(socket, opts)

;(async () => {
  // open the client
  await client.open()

  // join the swarm for the given topic and get the current peers for that topic
  const peersAvailable = await client.join(topic)

  // request a connection to a specific peer
  const remotePeer = client.connect(topic, peersAvailable[0])

  // optional, use the signal to listen for incoming media streams
  remotePeer.subscribeMediaStream = true

  try {
    // wait until the connection is established
    await remotePeer.ready()
    console.log(remotePeer.stream)
    // SimplePeer connected
  } catch(err) {
    // SimplePeer rejected
  }
})()
```

### Server

```javascript
const { SocketSignalServer } = require('socket-signal')

class YourServer extends SocketSignalServer {
  async _onDisconnect (rpc) {
    // onDisconnect a peer socket
  }

  async _onJoin (rpc, msg) {
    // msg.id, msg.topic
  }

  async _onLeave (rpc, msg) {
    // msg.id, msg.topic
  }

  async _onLookup (rpc, msg) {
    // msg.topic
  }

  /**
   * request signal offer
   */
  async _onOffer (rpc, msg) {
    // msg.remoteId, msg.topic, msg.data
  }

  /**
   * event signal
   *
   * this event is emitted when there is a signal candidate
   */
  async _onSignal (rpc, msg) {
    // msg.remoteId, msg.topic, msg.data
  }
}
```

> If you want a server with a minimal implementation to handle peer connections you can use [SocketSignalServerMap](lib/server-map.js).

## API

### Client

#### `const client = new Client(options)`

Creates a new client instance.

Options include:

- `id: Buffer`: ID of 32 bytes.
- `requestTimeout: 15 * 1000`: How long to wait for peer requests.
- `queueConcurrency: 4`: How many incoming connections in concurrent can handle
- `metadata: Object`: Metadata to share across network.
- `simplePeer: Object`: SimplePeer options.

> IMPORTANT: Every `id` and `topic` must be a `Buffer of 32 bytes`.

#### `client.open() => Promise`

Open the client.

#### `client.close() => Promise`

Close the client.

#### `client.join(topic: Buffer) => Promise<Array<Buffer>>`

Join the swarm for the given topic and do a `lookup` of peers available for that topic.

#### `client.leave(topic: Buffer) => Promise`

Leave the swarm for the given topic.

> IMPORTANT: This will not close the current peers for that topic you should call `closeConnectionsByTopic(topic)`

#### `client.closeConnectionsByTopic(topic: Buffer) => Promise`

Close all the connections referenced by a topic.

#### `client.connect(topic: Buffer, peerId: Buffer, options?: Object) => Peer`

Creates a `request` connection for a specific `topic` and `peerId`.

`options` include:

- `metadata: Object`: Metadata to share with the other peer.
- `simplePeer: Object`: Specific SimplePeer options for this connection.

`Peer` is an object with:

- `id: Buffer`: ID of the peer.
- `sessionId: Buffer`: Unique ID for this connection.
- `topic: Buffer`: Topic related.
- `localMetadata: Object`: Your metadata shared with the peer.
- `metadata: Object`: The remote metadata, belongs to the peer connected to.
- `stream: SimplePeer`: The SimplePeer internal stream.
- `subscribeMediaStream: boolean`: Set in `true` if you want to use the signal to listen for incoming media streams. Default: `false`.

#### `peer.ready() => Promise`

Wait for the connection to be established.

#### `peer.addStream(mediaStream) => Peer`

Add a media stream.

## <a name="issues"></a> Issues

:bug: If you found an issue we encourage you to report it on [github](https://github.com/geut/socket-signal/issues). Please specify your OS and the actions to reproduce it.

## <a name="contribute"></a> Contributing

:busts_in_silhouette: Ideas and contributions to the project are welcome. You must follow this [guideline](https://github.com/geut/socket-signal/blob/master/CONTRIBUTING.md).

## License

MIT © A [**GEUT**](http://geutstudio.com/) project
