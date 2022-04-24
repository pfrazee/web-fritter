# hypercore-promise

[![Build Status](https://travis-ci.com/geut/hypercore-promise.svg?branch=master)](https://travis-ci.com/geut/hypercore-promise)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

> An async/await based wrapper for [hypercore](https://github.com/hypercore-protocol/hypercore) (v9+)

## <a name="install"></a> Install

```
$ npm install @geut/hypercore-promise
```

## <a name="usage"></a> Usage

```javascript
const hypercore = require('@geut/hypercore-promise')

;(async () => {
  const feed = hypercore('./my-first-dataset', {valueEncoding: 'utf-8'})

  await feed.append('hello')
  await feed.append('world')

  console.log(await feed.get(0)) // prints hello
  console.log(await feed.get(1)) // prints world
})
```

### Differences with Hypercore

Some methods like `get` and `download` not only use callbacks but also returns a value directly.

```javascript
const id = feed.get(0, (err, data) => {
  console.log(data)
})
```

Since our methods return promises what you need to do to get the internal value is to use our function helper `getValue`.

```javascript
const { getValue } = require('hypercore-promise')

const promise = feed.get(0)
const id = getValue(promise)
promise.then(data => console.log(data))
```

`hypercore-promise` already detects the internal value so you don't need to use `getValue` in that case.

```javascript
const promise = feed.get(0)
feed.cancel(promise)
promise.catch(err => {
  console.log('was canceled')
})
```

## <a name="issues"></a> Issues

:bug: If you found an issue we encourage you to report it on [github](https://github.com/geut/hypercore-promise/issues). Please specify your OS and the actions to reproduce it.

## <a name="contribute"></a> Contributing

:busts_in_silhouette: Ideas and contributions to the project are welcome. You must follow this [guideline](https://github.com/geut/hypercore-promise/blob/master/CONTRIBUTING.md).

## License

MIT © A [**GEUT**](http://geutstudio.com/) project
