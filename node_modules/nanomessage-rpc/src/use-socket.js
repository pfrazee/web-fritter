const eos = require('end-of-stream')

function useSocket (socket, onCloseDestroyStream = true) {
  return {
    send (buf) {
      if (socket.destroyed) return
      socket.write(buf)
    },

    subscribe (next) {
      socket.on('data', next)
      return () => socket.removeListener('data', next)
    },

    open () {
      eos(socket, () => {
        this
          .close()
          .catch(err => process.nextTick(() => this.ee.emit('error', err)))
      })
    },

    close () {
      return new Promise(resolve => {
        if (socket.destroyed || !onCloseDestroyStream) return resolve()
        eos(socket, () => resolve())
        socket.destroy()
      })
    }
  }
}

module.exports = useSocket
