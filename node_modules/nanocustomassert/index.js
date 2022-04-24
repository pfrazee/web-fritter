module.exports = assert

class AssertionError extends Error {}
AssertionError.prototype.name = 'AssertionError'

/**
 * Minimal assert function + custom errors
 * @param  {any} t Value to check if falsy
 * @param  {string|function} m Optional assertion error message or nanoerror constructor
 * @param  {string=} rest Optional error parameters for nanoerror message
 * @throws {AssertionError || nanoerror}
 */
function assert (t, m, ...rest) {
  if (!t) {
    var err
    if (!m || typeof m === 'string') {
      err = new AssertionError(m)
    }
    if (typeof m === 'function') {
      // eslint-disable-next-line
      err = new m(...rest)
    }
    if (Error.captureStackTrace) Error.captureStackTrace(err, assert)
    throw err
  }
}
