var Time = require('monotonic-timestamp')
module.exports = function() {
  var timeStr = Time().toString(36)
  while (timeStr.length < 9)
    timeStr = '0' + timeStr
  return timeStr
}
