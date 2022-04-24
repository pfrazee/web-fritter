/* globals window */

const yo = require('yo-yo')
const nanorouter = require('nanorouter')
const SDK = require('hyper-sdk')
const LibFritter = require('./lib')
const views = require('../views/index')
const rerenderIndexingStatuses = require('../com/indexing-statuses').rerender
const renderErrorIcon = require('../com/icons/error')
const {toCSSColor, polyfillHistoryEvents, getURLOrigin, shortenDatURL, cssColorToHsla} = require('./util')
const defaultAvatarBase64Png = require('./default-avatar-base64-png')

module.exports = class FritterApp {
  constructor () {
    this.hyperdrive = null
    this.libfritter = null//new LibFritter('fritter')
    this.currentUser = null
    this.currentUserProfile = null
    this.currentView = 'feed'
    this.currentSubview = null
    this.currentLoaderPromise = null

    this.posts = null
    this.notifications = null
    this.indexingStatuses = {}
    this.hasNewPost = false
    this.unreadNotifications = 0
    this.notificationsLastReadTS = 0
    this.viewedProfile = null
    this.viewedProfilePostsCount = null
    this.viewedPost = null
    this.viewIsLoading = false
    this.viewError = null

    this.postDraftText = ''
    this.formEditValues = {}
    this.isIndexingStatusesExpanded = false
    this.isEditingPost = false
    this.failedToLoadUser = false
    this.tmpAvatar = null
    this.profilePickerInputUrl = null

    this.draftMentions = []

    this.possibleMentions = null
    this.mentionCoordinates = '0, 0'
    this.selectedMention = 0

    this.settings = null
    this.appColors = null
  }

  getAppColor (k) {
    return toCSSColor(this.appColors[k])
  }

  async setup () {
    const sdk = await SDK()
    const {Hyperdrive} = sdk
    this.Hyperdrive = Hyperdrive
    this.libfritter = new LibFritter({mainIndex: 'fritter', Hyperdrive})
    window.libfritter = this.libfritter

    // setup router
    this.router = nanorouter()
    this.router.on('/', () => this.setView('feed'))
    this.router.on('/thread/*', p => this.setView('thread', p.wildcard))
    this.router.on('/user/*', p => this.setView('user', p.wildcard))
    this.router.on('/notifications', p => this.setView('notifications'))
    this.router.on('/settings', p => this.setView('settings'))
    const onRouteChange = () => this.router(window.location.pathname)
    polyfillHistoryEvents()
    window.addEventListener('pushstate', onRouteChange)
    window.addEventListener('popstate', onRouteChange)

    // fetch settings from localStorage
    try {
      this.settings = JSON.parse(window.localStorage.settings)
    } catch (e) {
      this.settings = {}
    }

    // setup theme color
    if (!this.settings.themeColor) {
      this.settings.themeColor = '#1992FB'
    }
    this.setAppColors()

    // load database
    var userUrl = window.localStorage.userUrl
    if (userUrl) {
      this.currentUser = Hyperdrive(userUrl)
      await new Promise(r => this.currentUser.on('ready', r))
      window.user = this.currentUser
      this.currentUser.url = `hyper://${Buffer.from(this.currentUser.key).toString('hex')}`
      try {
        if (!this.currentUser.writable) throw "Not owner"
        this.libfritter.setUser(this.currentUser)
        await this.libfritter.prepareDrive(this.currentUser)
      } catch (e) {
        userUrl = null
        this.failedToLoadUser = true
      }
    }
    await this.libfritter.db.open()
    this.libfritter.db.on('source-indexing', this.onSourceIndexing.bind(this))
    this.libfritter.db.on('source-index-progress', this.onSourceIndexProgress.bind(this))
    this.libfritter.db.on('source-indexed', this.onSourceIndexed.bind(this))
    this.libfritter.db.on('source-missing', this.onSourceMissing.bind(this))
    this.libfritter.db.on('source-error', this.onSourceError.bind(this))
    if (userUrl) {
      await this.libfritter.db.indexDrive(this.currentUser)
      let success = await this.loadCurrentUserProfile()
      if (!success) {
        this.failedToLoadUser = true
      }
    }
    if (this.failedToLoadUser) {
      // reset so that the user can reconfigure
      this.currentUser = null
      window.localStorage.removeItem('userUrl')
    }
    onRouteChange()

    // set up secondary data
    await this.checkForNotifications()

    // fetch new posts and notifications every 10 seconds
    window.setInterval(this.checkForNewPosts.bind(this), 10e3)
    window.setInterval(this.checkForNotifications.bind(this), 10e3)

    // index everybody the user follows
    if (this.currentUserProfile) {
      await Promise.all(this.currentUserProfile.followUrls.map(async (url) => {
        try {
          await this.libfritter.db.indexDrive(url)
        } catch (e) {
          console.log('Failed to index', url, e)
        }

        // TODO
        // this was added because we wanted to show newly-indexed posts
        // but it was creating a really bad performance problem
        // commenting out for now to see what it's like without the rerenders
        // -prf
        // if (this.currentView === 'feed') {
        //   // reload feed and render as each is loaded
        //   this.posts = await this.loadFeedPosts(this.viewedProfile)
        //   this.render()
        // }
      }))
    }
  }

  async loadCurrentUserProfile () {
    this.currentUserProfile = await this.libfritter.social.getProfile(this.currentUser)
    if (this.currentUserProfile) {
      this.currentUserProfile.isCurrentUser = true
      return true
    }
    return false
  }

  async setView (view, param) {
    this.currentView = view
    this.currentSubview = null
    this.hasNewPost = false
    this.formEditValues = {}
    this.viewedProfile = null
    this.viewedPost = null
    this.viewError = null
    this.notifications = null

    // render "loading..."
    this.viewIsLoading = true
    this.render()

    try {
      // use `runInnerLoad` to only apply the updates if setView() isn't called again while loading
      await this.runInnerLoad(async (apply) => {
        if (this.failedToLoadUser) {
          apply({
            viewError: yo`<div>
              ${renderErrorIcon()} Your profile is empty or wasnt found. <a onclick=${e => window.location.reload()}>Reload the page</a> to setup a new profile.
            </div>`
          })
        } else if (view === 'feed') {
          apply({posts: await this.loadFeedPosts()})
          document.title = 'Fritter'
        } else if (view === 'user') {
          try {
            if (!param.startsWith('hyper://')) {
              param = `hyper://${param}`
          }
            await this.libfritter.db.indexDrive(param, {watch: false}) // index in case not already indexed
            let viewedProfile = await this.libfritter.social.getProfile(param)
            let posts = await this.loadFeedPosts(viewedProfile)
            let viewedProfilePostsCount = await this.libfritter.feed.countPosts({author: viewedProfile})
            apply({viewedProfile, posts, viewedProfilePostsCount})
          } catch (e) {
            apply({
              viewError: yo`<div>
                <p><strong>${renderErrorIcon()} Failed to load user at <a href=${param}>the given URL</a>.</strong></p>
                <p>${e.toString()}</p>
              </div>`
            })
          }
          document.title = 'Fritter'
        } else if (view === 'thread') {
          await this.libfritter.db.indexFile(param) // index in case not already indexed
          let viewedPost = await this.loadViewedPost(param)
          if (viewedPost) apply({viewedPost})
          else {
            apply({
              viewError: yo`<div>
                <p><strong>${renderErrorIcon()} Failed to load thread at <a href=${param}>the given URL</a>.</strong></p>
                <p>Post not found.</p>
              </div>`
            })
          }
          document.title = 'Fritter'
        } else if (view === 'notifications') {
          document.title = 'Fritter - Notifications'
          apply({
            notifications: await this.loadNotifications(),
            unreadNotifications: 0,
            notificationsLastReadTS: (+window.localStorage.notificationsLastReadTS || 0)
          })
          window.localStorage.notificationsLastReadTS = Date.now()
        } else if (view === 'settings') {
          document.title = 'Fritter - Settings'
        }
      })
    } catch (e) {
      this.viewError = e.toString()
    }

    this.viewIsLoading = false
    this.render()
    window.scrollTo(0, 0)
  }

  setSubview (subview) {
    this.currentSubview = subview
    this.render()
  }

  render () {
    views.render()
  }

  // loaders
  // =

  // helper to make sure a setView() only applies transactionally
  // without this, if a view is slow to load and the user clicks away, the load could finish and then mess up the page
  // with this, only the most recent setView() is applied to the app state
  async runInnerLoad (fn) {
    // abort any existing load process
    if (this.currentLoaderPromise) {
      this.currentLoaderPromise.abort()
    }

    // run the inner process with a guarded apply method
    var isAborted = false
    const apply = updates => {
      if (isAborted) return
      for (var k in updates) {
        this[k] = updates[k]
      }
    }
    this.currentLoaderPromise = fn(apply)
    this.currentLoaderPromise.abort = () => { isAborted = true }

    // now wait for it to finish
    await this.currentLoaderPromise
  }

  async loadFeedPosts (viewedProfile, opts = {}) {
    var query = {
      fetchAuthor: true,
      countVotes: true,
      reverse: true,
      rootPostsOnly: false,
      countReplies: true,
      limit: 20,
      before: opts.before || 0
    }
    if (viewedProfile) {
      query.rootPostsOnly = false
      query.author = viewedProfile.getRecordOrigin()
    } else {
      query.authors = this.getAuthorWhitelist()
    }
    var posts = await this.libfritter.feed.listPosts(query)
    posts = await Promise.all(posts.map(async p => {
      if (p.threadParent) {
        p.threadParentPost = await this.libfritter.feed.getPost(p.threadParent)
      }
      return p
    }))
    return posts
  }

  async loadViewedPost (href) {
    try {
      var viewedPost = await this.libfritter.feed.getThread(href)
      if (viewedPost) {
        if (viewedPost.author) {
          viewedPost.author.isCurrentUser = viewedPost.author.getRecordOrigin() === this.currentUserProfile.getRecordOrigin()
        } else {
          let url = getURLOrigin(href)
          viewedPost.author = {url, name: shortenDatURL(url)}
        }
      }
      return viewedPost
    } catch (e) {
      console.error(e)
    }
  }

  async checkForNewPosts () {
    var query = {
      limit: 1,
      reverse: true,
      rootPostsOnly: false,
      authors: this.getAuthorWhitelist()
    }

    if (this.viewedProfile) {
      query.rootPostsOnly = false
      query.author = this.viewedProfile.getRecordOrigin()
    }

    let newestPost = await this.libfritter.feed.listPosts(query)
    newestPost = newestPost[0]

    let hasNewPost = (newestPost && this.posts && this.posts[0] && newestPost.getRecordURL() !== this.posts[0].getRecordURL())
    if (hasNewPost !== this.hasNewPost) {
      this.hasNewPost = hasNewPost
      this.render()
    }
  }

  async reloadFeed () {
    this.posts = await this.loadFeedPosts(this.viewedProfile)
    this.hasNewPost = false
    this.render()
  }

  async loadMorePosts () {
    this.isLoadingPosts = true
    this.render()

    this.posts = this.posts || []
    // using the timestamp as the cursor means there's a small chance that a
    // post will be excluded if two posts have the same timestamp AND the limit
    // falls on the first post
    let before = 0
    if (this.posts.length) {
      before = this.posts[this.posts.length - 1].createdAt
    }

    await this.runInnerLoad(async (apply) => {
      const newPosts = await this.loadFeedPosts(this.viewedProfile, {before})
      this.isLoadingPosts = false
      apply({posts: this.posts.concat(newPosts)})
    })
    this.render()
  }

  async loadNotifications () {
    // using the timestamp as the cursor means there's a small chance that
    // a notification will be excluded if two notifications have the same
    // timestamp
    let before = 0
    if (this.notifications && this.notifications.length) {
      before = this.notifications[this.notifications.length - 1].createdAt
    }

    let notifications = await this.libfritter.notifications.listNotifications({
      reverse: true,
      fetchAuthor: true,
      fetchPost: true,
      limit: 15,
      before
    })
    return notifications
  }

  async loadMoreNotifications () {
    this.notifications = this.notifications || []
    await this.runInnerLoad(async (apply) => {
      const newNotifications = await this.loadNotifications()
      apply({notifications: this.notifications.concat(newNotifications)})
    })
    this.render()
  }

  async checkForNotifications () {
    const oldCount = this.unreadNotifications
    const after = (+window.localStorage.notificationsLastReadTS)
    this.unreadNotifications = await this.libfritter.notifications.countNotifications({after})
    if (oldCount !== this.unreadNotifications) {
      document.title = `Fritter - Notifications (${this.unreadNotifications})`
      this.render()
    }
  }

  isAllowedImage (url) {
    const imageSetting = this.settings.imageEmbed || 'none'

    // no images allowed
    if( imageSetting === 'none' ){
      return false
    }

    // all images allowed
    if( imageSetting === 'all' ){
      return true
    }

    // only dats allowed
    if( imageSetting === 'dat' ){
      return url.startsWith('hyper://')
    }

    // only followed dats allowed
    if( imageSetting === 'dat-followed' ){
      const targetUser = getURLOrigin(url)
      return url.startsWith('hyper://') && this.currentUserProfile.follows.filter(user => user.url == targetUser).length
    }

    // default false
    return false
  }

  toggleIndexingStatusesExpanded () {
    this.isIndexingStatusesExpanded = !this.isIndexingStatusesExpanded
    rerenderIndexingStatuses()
  }

  onSourceIndexing (url, startVersion, targetVersion) {
    this.indexingStatuses[url] = {isIndexing: true, error: false, progress: 0}
    rerenderIndexingStatuses()
  }

  onSourceIndexProgress (url, tick, total) {
    this.indexingStatuses[url] = {isIndexing: true, error: false, progress: Math.round(tick / total * 100)}
    rerenderIndexingStatuses()
  }

  onSourceIndexed (url, version) {
    this.indexingStatuses[url] = {isIndexing: false, error: false}
    rerenderIndexingStatuses()
  }

  onSourceMissing (url) {
    this.indexingStatuses[url] = {isIndexing: false, error: 'missing'}
    rerenderIndexingStatuses()
  }

  onSourceError (url, error) {
    this.indexingStatuses[url] = {isIndexing: false, error}
    rerenderIndexingStatuses()
  }

  // mutators
  // =

  setAppColors () {
    const themeColor = cssColorToHsla(this.settings.themeColor)
    this.appColors = {
      base: themeColor,
      border: Object.assign({}, themeColor, {l: 75}),
      boxShadow: Object.assign({}, themeColor, {l: 85}),
      faded: Object.assign({}, themeColor, {l: 97}),
      hover: Object.assign({}, themeColor, {l: 99}),
      primaryBtnHover: Object.assign({}, themeColor, {l: themeColor.l - 6})
    }
  }

  updateSettings (settings = {}) {
    this.settings = Object.assign(this.settings, settings)
    window.localStorage.settings = JSON.stringify(this.settings)
  }

  async updateProfile ({name, bio} = {}) {
    // create user if needed
    if (!this.currentUser) {
      this.currentUser = this.Hyperdrive('my_profile')
      await new Promise(r => this.currentUser.on('ready', r))
      this.currentUser.url = `hyper://${Buffer.from(this.currentUser.key).toString('hex')}`
      console.log(this.currentUser.url)
      await this.libfritter.prepareDrive(this.currentUser)
      await this.libfritter.db.indexDrive(this.currentUser)
      window.localStorage.userUrl = this.currentUser.url
      this.tmpAvatar = this.tmpAvatar || {imgData: defaultAvatarBase64Png, imgExtension: 'png'}
    }
    window.user = this.currentUser

    // update profile
    await this.libfritter.social.setProfile(this.currentUser, {name, bio})

    // if the avatar's changed, update the profile avatar
    if (this.tmpAvatar) {
      await this.libfritter.social.setAvatar(this.currentUser, this.tmpAvatar.imgData, this.tmpAvatar.imgExtension)
    }
    this.tmpAvatar = undefined

    // reload user data
    await this.loadCurrentUserProfile()
  }

  async toggleFollowing (user) {
    var userUrl = user.getRecordOrigin ? user.getRecordOrigin() : user.url // we may be given a profile record or a follows record
    if (this.isCurrentUserFollowing(user)) {
      await this.libfritter.social.unfollow(this.currentUser, userUrl)
    } else {
      await this.libfritter.social.follow(this.currentUser, userUrl, user.name || '')
      /* dont await */ this.libfritter.db.indexDrive(userUrl)
    }
    await this.loadCurrentUserProfile()
    this.render()
  }

  async unfollowByURL (userUrl) {
    // delete the indexing state
    delete this.indexingStatuses[userUrl]

    // unfollow
    await this.libfritter.social.unfollow(this.currentUser, userUrl)
    await this.loadCurrentUserProfile()
    this.render()
  }

  async toggleLiked (p) {
    const vote = p.votes.upVoters.includes(this.currentUser.url) ? 0 : 1
    await this.libfritter.feed.vote(this.currentUser, {vote, subject: p.getRecordURL()})
    p.votes = await this.libfritter.feed.countVotesFor(p.getRecordURL())
    return vote
  }

  // helpers
  // =

  isCurrentUser (url) {
    if (!this.currentUserProfile) return false
    return this.currentUserProfile.getRecordOrigin() === url
  }

  isCurrentUserFollowing (url) {
    if (!this.currentUserProfile) return false
    if (typeof url !== 'string') {
      url = url.getRecordOrigin ? url.getRecordOrigin() : url.url
    }
    return this.currentUserProfile.followUrls.includes(url)
  }

  getAuthorWhitelist () {
    if (!this.currentUserProfile) return []
    return this.currentUserProfile.followUrls.concat(this.currentUser.url)
  }

  gotoFeed (e) {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    window.history.pushState({}, null, '/')
  }

  gotoNotifications (e) {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    window.history.pushState({}, null, '/notifications')
  }

  gotoSettings (e) {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    window.history.pushState({}, null, '/settings')
  }

  threadUrl (post) {
    const threadUrl = post.getRecordURL ? post.getRecordURL() : post
    return '/thread/' + threadUrl
  }

  gotoThread (post, e) {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    window.history.pushState({}, null, this.threadUrl(post))
  }

  profileUrl (profile) {
    if (!profile) return
    const url = profile.getRecordOrigin ? profile.getRecordOrigin() : profile.url
    return '/user/' + url
  }

  gotoProfile (profile, e) {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    window.history.pushState({}, null, this.profileUrl(profile))
  }

  copyProfileUrl () {
    var profileUrl = document.getElementById('profile-url')
    profileUrl.select()
    document.execCommand('copy')
  }
}
