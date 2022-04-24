# fsctl

Series of small native fd utils for manipulating file attributes and more

```
npm install fsctl
```

## Usage

``` js
const { lock, unlock, sparse } = require('fsctl')

// Can we lock the file using the fd?
console.log(lock(fd))

// Can we unlock it?
console.log(unlock(fd))

// Can we set the file as sparse?
console.log(sparse(fd))
```

## API

#### `bool = fsctl.lock(fd)`

Try to lock access to a file using a file descriptor.
Returns true if the file could be locked, false if not.

Note that the lock is only advisory and there is nothing stopping someone from accessing the file by simply ignoring the lock.

Works across processes as well.

#### `bool = fsctl.unlock(fd)`

Unlocks a file if you have the lock.

#### `bool = fsctl.sparse(fd)`

Set the file as sparse (ie allow it to have unallocated holes)

## Credits

Thanks to @xori for adding the sparse util.

## License

MIT
