const {toUrl, toDriveOrigin} = require('./util')

// exported api
// =

class LibFritterSocialAPI {
  constructor (libfritter) {
    this.db = libfritter.db
  }

  getProfile (drive) {
    var driveUrl = toDriveOrigin(drive)
    return this.db.profiles.get(driveUrl + '/profile.json')
  }

  async setProfile (drive, profile) {
    var driveUrl = toDriveOrigin(drive)
    await this.db.profiles.upsert(driveUrl + '/profile.json', profile)
  }

  async setAvatar (drive, imgData, extension) {
    drive = this.db._drives[toDriveOrigin(drive)]
    if (!drive) throw new Error('Given drive is not indexed by WebDB')
    const filename = `avatar.${extension}`
    await drive.writeFile(filename, imgData, typeof imgData === 'string' ? 'base64' : 'binary')
    return this.db.profiles.upsert(drive.url + '/profile.json', {avatar: filename})
  }

  async follow (drive, target, name) {
    // update the follow record
    var driveUrl = toDriveOrigin(drive)
    var targetUrl = toDriveOrigin(target)
    var changes = await this.db.profiles.where(':origin').equals(driveUrl).update(record => {
      record.follows = record.follows || []
      if (!record.follows.find(f => f.url === targetUrl)) {
        record.follows.push({url: targetUrl, name})
      }
      return record
    })
    if (changes === 0) {
      throw new Error('Failed to follow: no profile record exists. Run setProfile() before follow().')
    }
  }

  async unfollow (drive, target) {
    // update the follow record
    var driveUrl = toDriveOrigin(drive)
    var targetUrl = toDriveOrigin(target)
    var changes = await this.db.profiles.where(':origin').equals(driveUrl).update(record => {
      record.follows = record.follows || []
      record.follows = record.follows.filter(f => f.url !== targetUrl)
      return record
    })
    if (changes === 0) {
      throw new Error('Failed to unfollow: no profile record exists. Run setProfile() before unfollow().')
    }
  }

  getFollowersQuery (drive) {
    var driveUrl = toDriveOrigin(drive)
    return this.db.profiles.where('followUrls').equals(driveUrl)
  }

  listFollowers (drive) {
    return this.getFollowersQuery(drive).toArray()
  }

  countFollowers (drive) {
    return this.getFollowersQuery(drive).count()
  }

  async isFollowing (driveA, driveB) {
    var driveAUrl = toDriveOrigin(driveA)
    var driveBUrl = toDriveOrigin(driveB)
    var profileA = await this.db.profiles.get(driveAUrl + '/profile.json')
    return profileA.followUrls.indexOf(driveBUrl) !== -1
  }

  async listFriends (drive) {
    var followers = await this.listFollowers(drive)
    await Promise.all(followers.map(async follower => {
      follower.isFriend = await this.isFollowing(drive, follower.getRecordOrigin())
    }))
    return followers.filter(f => f.isFriend)
  }

  async countFriends (drive) {
    var friends = await this.listFriends(drive)
    return friends.length
  }

  async isFriendsWith (driveA, driveB) {
    var [a, b] = await Promise.all([
      this.isFollowing(driveA, driveB),
      this.isFollowing(driveB, driveA)
    ])
    return a && b
  }
}

module.exports = LibFritterSocialAPI