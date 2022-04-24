const tape = require('tape')
const NL = require('./')

tape('basic', function (t) {
  const nl = new NL()

  t.same(nl.push('abe\nfest\ner\r\nsjov'), ['abe', 'fest', 'er'])
  t.same(nl.end(), ['sjov'])
  t.end()
})

tape('basic chunked', function (t) {
  const nl = new NL()

  t.same(nl.push('abe\nfest\ner\r\nsjov'), ['abe', 'fest', 'er'])
  t.same(nl.push('...'), [])
  t.same(nl.push('!\r'), [])
  t.same(nl.push('\n'), ['sjov...!'])
  t.same(nl.end(), [])
  t.end()
})
