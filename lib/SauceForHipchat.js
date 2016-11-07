/* eslint no-console: 0 */
var uuid = require('uuid');
var promisify = require('es6-promisify-all');
var SauceLabs = require('saucelabs');
var moment = require('moment');
var autobind = require('class-autobind').default;
var Hipchat = require('./hipchat');
var mixpanel = require('./mixpanel');

SauceLabs.prototype.showJob = function (id, callback) {
  this.send({
    method: 'GET',
    path: 'jobs/:id',
    args: { id: id }
  }, callback);
};

SauceLabs.prototype.getBuild = function (name, username, callback) {
  this.send({
    method: 'GET',
    path: ':username/builds/:name',
    args: { username: username, name: encodeURIComponent(name) }
  }, callback);
};
SauceLabs.prototype = promisify(SauceLabs.prototype);

const MESSAGE_URL_PATTERN = /https?:\/\/(?:[a-zA-Z0-9_-]+\.dev\.saucelabs\.net|saucelabs\.com)(?:\/beta)?\/tests\/([a-zA-Z0-9]{32})/;

const cleanupJob = (job) => {
  return Object.assign({}, job, {
    creation_time: job.creation_time*1000,
    end_time: job.end_time*1000
  });
};

const addBuildInfo = (sauceAccount, job) => {
  if (!job.build) { return job; }
  return sauceAccount.getBuildAsync(job.build, job.owner).then(build => {
    job.build_id = build.id
    return job;
  }).catch(() => job);
}

class SauceForHipchat {
  constructor(addon) {
    this.hipchat = Hipchat(addon);
    this.addon = addon;
    autobind(this);
  }

  embedDialog(req, res, type) {
    return this.getSauceAccount(req.clientInfo.clientKey)
      .then(sauceAccount => {
        return sauceAccount.createPublicLinkAsync(req.params.jobId).then(function(url) {
          res.render(`embed-dialog`, {
            type: type,
            identity: req.identity,
            jobId: req.params.jobId,
            hostname: sauceAccount.options.hostname,
            auth: url.replace(/.*auth=([a-zA-Z0-9]+)/, '$1')
          });
        });
      });
  }

  getSauceAccount(clientKey) {
    return this.addon.settings.get('sauceAccount', clientKey)
      .then(accountInfo => {
        if (!accountInfo) {
          throw new Error(`${clientKey} is not logged in`);
        }
        return new SauceLabs(accountInfo)
      });
  }

  getGlanceData(clientKey) {
    return this.getSauceAccount(clientKey).then(() => {
        return { 'label': { 'type': 'html', 'value': 'Sauce Labs' }, };
      })
      .catch(() => {
        return {
          label: { 'type': 'html', 'value': 'Sauce Labs' },
          status: {
            'type': 'lozenge',
            'value': { 'label': 'Needs Login', 'type': 'error' }
          }
        };
      });
  }

  routerGetConfig(req, res) {
    return this.getSauceAccount(req.clientInfo.clientKey).then(sauceAccount => {
      mixpanel.track('getConfigPage', {
        distinct_id: req.clientInfo.clientKey,
        state: 'alreadyLoggedIn'
      });
      res.render('alreadyLoggedIn', { username: sauceAccount.username });
    }).catch(() => {
      mixpanel.track('getConfigPage', {
        distinct_id: req.clientInfo.clientKey,
        state: 'signin'
      });
      res.render('signin', { sidebar: false });
    });
  }

  routerPostConfig(req, res) {
    if (!req.body.username || !req.body.accessKey) {
      res.status(400).send({ success: false, error: 'missing' });
      return;
    }

    const data = { username: req.body.username, password: req.body.accessKey }
    if (req.body.server) { data.hostname = req.body.server; }
    const sauceAccount = new SauceLabs(data);

    mixpanel.track('postConfigPage', {
      distinct_id: req.clientInfo.clientKey,
    });

    return sauceAccount.getAccountDetailsAsync().then((sauceAccountDetails) => {
      return this.addon.settings.set('sauceAccount', data, req.clientInfo.clientKey).then(() => {
        mixpanel.people.set(req.clientInfo.clientKey, {
          $first_name: sauceAccountDetails.first_name,
          $last_name: sauceAccountDetails.last_name,
          $email: sauceAccountDetails.email,
          username: sauceAccountDetails.username,
          hipchatGroupName: req.clientInfo.groupName
        });
        return this.getGlanceData(req.clientInfo.clientKey)
          .then(data => this.hipchat.updateGlance(req.clientInfo, req.identity.roomId || req.clientInfo.roomId, 'saucelabs.glance', data));
      })
    }).catch(err => {
      console.log('err', err.body || err);
      res.status(400).send({ success: false, error: err.message });
      return;
    }).then(() => res.json({ success: true }));
  }

  routerDeleteConfig(req, res) {
    mixpanel.track('deleteConfigPage', {
      distinct_id: req.clientInfo.clientKey,
    });
    return this.addon.settings.del('sauceAccount', req.clientInfo.clientKey).then(() => {
      return this.getGlanceData(req.clientInfo.clientKey)
        .then(data => this.hipchat.updateGlance(req.clientInfo, req.identity.roomId || req.clientInfo.roomId, 'saucelabs.glance', data));
    }).then(() => res.json({ success: true }));
  }

  routerGetGlance(req, res) {
    return this.getGlanceData(req.clientInfo.clientKey)
      .then(data => res.json(data));
  }

  routerGetSidebar(req, res) {
    mixpanel.track('getSidebar', {
      distinct_id: req.clientInfo.clientKey,
    });
    return this.getSauceAccount(req.clientInfo.clientKey).then(sauceAccount => {
      return sauceAccount.getJobsAsync().then(jobs => {
        return res.render('sidebar-jobs', {
          hostname: sauceAccount.options.hostname,
          identity: req.identity,
          jobs: jobs.map(job => cleanupJob(job))
        });
      });
    }).catch((err) => {
      console.log('err', err);
      return res.render('signin', { sidebar: true });
    });
  }

  routerGetJob(req, res) {
    mixpanel.track('getJobEmbed', {
      distinct_id: req.clientInfo.clientKey,
    });
    return this.embedDialog(req, res, 'job');
  }

  routerGetVideo(req, res) {
    mixpanel.track('getVideoEmbed', {
      distinct_id: req.clientInfo.clientKey,
    });
    return this.embedDialog(req, res, 'video');
  }

  routerGetScreenshots(req, res) {
    mixpanel.track('getScreenshots', {
      distinct_id: req.clientInfo.clientKey,
    });
    return this.getSauceAccount(req.clientInfo.clientKey)
      .then(sauceAccount => {
        return sauceAccount.showJobAsync(req.params.jobId)
          .then(job => cleanupJob(job))
          .then(job => addBuildInfo(sauceAccount, job))
          .then(job => {
            return sauceAccount.showJobAssetsAsync(req.params.jobId).then(function(assets) {
              return sauceAccount.createPublicLinkAsync(req.params.jobId).then(function(url) {
                res.render('screenshots-dialog', {
                  assets: assets,
                  identity: req.identity,
                  job: job,
                  hostname: sauceAccount.options.hostname,
                  auth: url.replace(/.*auth=([a-zA-Z0-9]+)/, '$1')
                });
              });
            });
          });
      });
  }

  routerPostWebhooksSauce(req, res) {
    /* FIXME -- really just for testing/debugging */
    return this.getGlanceData(req.clientInfo.clientKey)
      .then(data => this.hipchat.updateGlance(req.clientInfo, req.identity.roomId, 'saucelabs.glance', data))
      .then(() => this.hipchat.sendMessage(req.clientInfo, req.identity.roomId, 'Updating glance'))
      .then(() => res.sendStatus(200));
  }

  routerPostWebhooksUrl(req, res) {
    const message = req.body.item.message.message;
    const results = MESSAGE_URL_PATTERN.exec(message);
    const id = results[1];
    if (!id) {
      // Not a valid url
      res.sendStatus(200);
      return;
    }

    mixpanel.track('postSauceUrl', {
      distinct_id: req.clientInfo.clientKey,
      jobId: id
    });

    const jobColorStatus = {
      'error': 'red',
      'failed': 'red',
      'passed': 'green',
      'complete': 'green'
      // in progress|running
    };

    return this.getSauceAccount(req.clientInfo.clientKey)
      .then(sauceAccount => {
        return sauceAccount.showJobAsync(id)
          .then(job => cleanupJob(job))
          .then(job => addBuildInfo(sauceAccount, job))
          .then(job => {
            return sauceAccount.showJobAssetsAsync(id).then((assets) => {
              return sauceAccount.createPublicLinkAsync(id).then((publicUrl) => {
                const auth = publicUrl.replace(/.*auth=([a-zA-Z0-9]+)/, '$1') ;

                const attributes = [
                  { label: 'Owner', value: { label: job.owner } },
                  { label: 'Status', value: { label: job.consolidated_status } },
                  { label: 'Platform', value: { label: `${job.os} ${job.browser} ${job.browser_version}` } },
                  { label: 'Start', value: { label: moment(job.creation_time).format("lll") } },
                  { label: 'End', value: { label: moment(job.end_time).format("lll") } },
                  { label: 'Duration', value: { label: moment.duration(moment(job.end_time).diff(moment(job.creation_time))).humanize() } }
                ];
                var card = {
                  'style': 'application',
                  'id': uuid.v4(),
                  'metadata': { 'sauceJobId': id, 'isSauceMessage': true },
                  'format': 'medium',
                  'url': `hipchat://${req.clientInfo.capabilitiesDoc.links.homepage.split('/').pop()}/room/${req.identity.roomId}?target=job.details.dialog-meta`,
                  'title': job.name || '---Missing Job Name---',
                  'attributes': attributes
                };

                if (job.error) {
                  card.description = {
                    format: 'html',
                    value: `<b>Error</b>: ${job.error}`
                  }
                }
                if (job.build_id) {
                  attributes.push({
                    label: 'Build',
                    value: {
                      url: `https://${sauceAccount.options.hostname}/beta/builds/${job.build_id}?auth=${auth}`,
                      label: job.build
                    }
                  });
                }

                if (assets.screenshots) {
                  const image = assets.screenshots[assets.screenshots.length-1];
                  card.thumbnail = {
                    url: `https://${sauceAccount.options.hostname}/rest/v1/${job.owner}/jobs/${job.id}/assets/${image}?auth=${auth}`
                  };
                }
                var msg = `<a href="${publicUrl}"><b>${card.title}</b></a> `;
                if (card.description) { msg = msg + card.description.value; }

                var opts = {
                  message_format: 'html',
                  color: jobColorStatus[job.consolidated_status] || 'gray',
                  message: msg
                };
                return this.hipchat.sendMessage(req.clientInfo, req.identity.roomId, msg, opts, card);
              });
            });
        });
      }).catch(err => {
        /* TODO create and handle Not logged in Exception */
        console.error('err', err);
        this.hipchat.sendMessage(req.clientInfo, req.identity.roomId, `Unable to process url`);
        throw err;
      }).then(() => res.json({}));
  }

  addonOnInstall(clientKey, clientInfo, req) {
    mixpanel.track('addonInstalled', {
      distinct_id: clientKey,
    });
    return this.hipchat.sendMessage(clientInfo, req.body.roomId, 'The ' + this.addon.descriptor.name + ' add-on has been installed in this room');
  }

  addonOnUninstall(clientKey) {
    mixpanel.track('addonUninstalled', {
      distinct_id: clientKey,
    });
    // Make sure to add any new scopes
    return Promise.all(['clientInfo', 'send_notification', 'sauceAccount'].map((k) => {
      this.addon.logger.info('Removing key:', k);
      return this.addon.settings.del(k, clientKey);
    }));
  }

  updateAllGlances() {
    const errors = [];
    return this.addon.settings.getAllClientInfos().then(clients => {
      return Promise.all(clients.map(clientInfo => {
        return this.getGlanceData(clientInfo.clientKey)
          .then(data => this.hipchat.updateGlance(clientInfo, clientInfo.roomId || '', 'saucelabs.glance', data))
          .catch(err => { errors.push(err); return });
      }))
      .then(() => {
        if (errors.length) {
          throw new Error(errors);
        }
      });
    });
  }
}

module.exports = SauceForHipchat;

