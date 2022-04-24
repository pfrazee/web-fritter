# nanoerror

[![Build Status](https://travis-ci.com/geut/nanoerror.svg?branch=master)](https://travis-ci.com/geut/nanoerror)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

> Small module to create code errors with format support.

## <a name="install"></a> Install

```
$ npm install nanoerror
```

## <a name="usage"></a> Usage

```javascript
const createError = require('nanoerror')

const ERR_EXAMPLE = createError('ERR_EXAMPLE', 'An error with the args: %s %j')

try {
  throw new ERR_EXAMPLE('arg1', { somejson: true })
} catch (err) {
  console.log(err.code) // ERR_EXAMPLE
  console.log(err.message) // An error with the args: arg1 {"somejson": true}
}
```

## API

#### `const ERR = createError(code: string, message: string)`

Creates a new nanoerror class.

#### `err.isNanoerror => boolean`

Returns true if the err is a nanoerror instance.

#### `ERR.equals(err) => boolean`

Returns true if the err belongs to a specific nanoerror class.

#### `ERR.from(err) => ERR`

Creates an error based on the options of another one.

## <a name="issues"></a> Issues

:bug: If you found an issue we encourage you to report it on [github](https://github.com/geut/nanoerror/issues). Please specify your OS and the actions to reproduce it.

## <a name="contribute"></a> Contributing

:busts_in_silhouette: Ideas and contributions to the project are welcome. You must follow this [guideline](https://github.com/geut/nanoerror/blob/master/CONTRIBUTING.md).

## License

MIT © A [**GEUT**](http://geutstudio.com/) project
