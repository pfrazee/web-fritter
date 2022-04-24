# newline-decoder

Simple chunked decoder for newline delimited string that isn't a stream

```
npm install newline-decoder
```

## Usage

``` js
const NewlineDecoder = require('newline-decoder')

const nl = new NewlineDecoder()

nl.push('test') // returns []
nl.push('of') // returns []
nl.push('this\n') // returns ['testofthis']
```

## API

#### `nl = new NewlineDecoder([enc])`

Create a new instance. `enc` defaults to `utf-8`

#### `lines = nl.push(data)`

Push a new data chunk to the decoder. Can be a buffer or a string.
Returns the lines decoded.

#### `lines = nl.end()`

End the decoder. Returns whatever is left in the buffer in an array for consistency.

## License

MIT
