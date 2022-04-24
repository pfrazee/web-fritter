# nanocustomassert

[![Build Status](https://travis-ci.com/geut/nanocustomassert.svg?branch=master)](https://travis-ci.com/geut/nanocustomassert)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

> assert your code + throw custom errors = 🎰

## <a name="install"></a> Install

```
npm i nanocustomassert
```

## <a name="usage"></a> Usage

```javascript
const assert = require('nanocustomassert')

// simple assert => AssertionError
assert('a' === 'a', 'should be equal')

// or custom errors => MyError
class MyError extends Error {}
const key1 = 'a1'
const key2 = 'b2'
assert(key1 === key2, MyError)

// or nanoerrors!!!
const nanoerror = require('nanoerror')
const CoolError = nanoerror('COOL_ERR', '🤖COOL ERROR FOUND: %s')
assert(false, CoolError, "Oops 🙈")
```

## <a name="api"></a> API

`const assert = require('nanocustomassert')`

### assert

> `assert(expresion: JS expresion, message: string || function constructor, ...params)`

Evaluates the expresion, if falsy throws an AssertionError or a custom error. See [nanoerror](https://github.com/geut/nanoerror).

- expression: the expresion to assert
- message: can be a `string` used as a message for the AssertionError or a `function` constructor. This is useful to throw a custom error. **Optional**
- params: these params are applied to the custom constructor function. **Optional**

## <a name="inspiration"></a>Inspiration

This module is heavily inspired by [nanoassert](https://github.com/emilbayes/nanoassert) from Emil Bayes. :clap:

## <a name="issues"></a> Issues

:bug: If you found an issue we encourage you to report it on [github](https://github.com/geut/nanocustomassert/issues). Please specify your OS and the actions to reproduce it.

## <a name="contribute"></a> Contributing

:busts_in_silhouette: Ideas and contributions to the project are welcome. You must follow this [guideline](https://github.com/geut/nanocustomassert/blob/master/CONTRIBUTING.md).

## License

MIT © A [**GEUT**](http://geutstudio.com/) project
