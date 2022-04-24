# hypercore-default-storage

Default storage provider used by Hypercore

```
npm install hypercore-default-storage
```

## Usage

``` js
const defaultStorage = require('hypercore-default-storage')

const feed = hypercore(name => defaultStorage(name, { directory: 'feed' }))
```

## API

#### `storage = defaultStorage(name, [options])`

Makes a new random-access-storage provider using the random-access-file module.

If making a bitfield file that file will be locked to avoid parallel writers.

## License

MIT
