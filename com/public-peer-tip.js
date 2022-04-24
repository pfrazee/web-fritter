/* globals app */
const yo = require('yo-yo')
const renderLinkIcon = require('./icons/link')

// exported api

module.exports = function renderPublicPeerTip () {
  if (app.settings.dismissedPublicPeerTip) return ''

  return yo`
    <div class="module">
      <button class="btn full-width" onclick=${app.copyProfileUrl}>
        Copy your profile URL
        ${renderLinkIcon()}
      </button>

      <button class="btn dismiss-btn" onclick=${onDismiss}></button>
    </div>
  `

  function onDismiss () {
    app.updateSettings({dismissedPublicPeerTip: true})
    app.render()
  }
}
