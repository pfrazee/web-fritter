# freemap

Numeric map with a free list

```
npm install freemap
```

## Usage

``` js
const FreeMap = require('freemap')

const f = new FreeMap()

const id = f.add({ hello: 'world' })
const id2 = f.add({ hello: 'verden' })

console.log(f.get(id)) // { hello: world }
console.log(f.get(id2)) // { hello: verden }
```

## API

#### `const f = new FreeMap(idOffset = 0)`

Make a new FreeMap

#### `id = f.add(value)`

Add a new value. Returns a free id from the freelist or allocates a new one. Runs in O(1)

#### `f.set(id, value)`

Update a value. Runs in O(1)

#### `value = f.get(id)`

Get a value. Runs in O(1)

#### `f.free(id)`

"Free" an id. Pushes the used id to a internal freelist. Runs in O(1)

#### `...f`

The map is iteratable. Each entry is `[id, value]` in the iterator.

## License

MIT
