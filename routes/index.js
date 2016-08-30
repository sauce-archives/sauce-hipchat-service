/* eslint no-console: 0 */
var cors = require('cors');
var uuid = require('uuid');
var url = require('url');
var router = require('express-promise-router')();
var promisify = require('es6-promisify-all');
var SauceLabs = require('saucelabs');
var moment = require('moment');

SauceLabs.prototype = promisify(SauceLabs.prototype);

// This is the heart of your HipChat Connect add-on. For more information,
// take a look at https://developer.atlassian.com/hipchat/tutorials/getting-started-with-atlassian-connect-express-node-js
module.exports = function (app, addon) {
  var hipchat = require('../lib/hipchat')(addon);
  app.use('/', router);

  const getSauceAccount = (clientKey) => {
    return addon.settings.get('sauceAccount', clientKey)
      .then(accountInfo => {
        if (!accountInfo) {
          throw new Error(`${clientKey} is not logged in`);
        }
        return new SauceLabs(accountInfo)
      });
  }

  const cleanupJob = (job) => {
    return Object.assign({}, job, {
      creation_time: job.creation_time*1000,
      end_time: job.end_time*1000
    });
  };

  const getGlanceData = (clientKey) => {
    return getSauceAccount(clientKey)
      .then(sauceAccount => {
        return sauceAccount.getJobsAsync().then(jobs => {
          let data = {
            count: jobs.length,
            statuses: jobs.reduce(function(statusCount, job) {
              if (!statusCount[job.consolidated_status]) { statusCount[job.consolidated_status] = 0; }
              statusCount[job.consolidated_status]++;
              return statusCount;
            }, {})
          };
          let ret = { 'label': { 'type': 'html', 'value': 'Sauce Labs' }, };
          if (data.statuses.new) {
            ret.status = {
              'type': 'lozenge',
              'value': { 'label': data.statuses.new + ' NEW', 'type': 'new' }
            };
          }
          return ret;
        });
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

  // simple healthcheck
  router.get('/healthcheck', function (req, res) {
    res.send('OK');
  });

  router.get('/gavin', function(req, res) {
    addon.settings.client.keys('*:clientInfo', function (err, rep) {
      res.json(rep);
    });
  });
  // Root route. This route will serve the `addon.json` unless a homepage URL is
  // specified in `addon.json`.
  router.get('/',
    function (req, res) {
      // Use content-type negotiation to choose the best way to respond
      res.format({
        // If the request content-type is text-html, it will decide which to serve up
        'text/html': function () {
          var homepage = url.parse(addon.descriptor.links.homepage);
          if (homepage.hostname === req.hostname && homepage.path === req.path) {
            res.render('homepage', Object.assign({}, addon.descriptor, {_key: addon.descriptor.key}));
          } else {
            res.redirect(addon.descriptor.links.homepage);
          }
        },
        // This logic is here to make sure that the `addon.json` is always
        // served up when requested by the host
        'application/json': function () {
          res.redirect('/atlassian-connect.json');
        }
      });
    }
    );

  router.get('/config', addon.authenticate(), function (req, res) {
      res.render('signin', { sidebar: false });
    });

  router.post('/config', addon.authenticate(), function (req, res) {
    if (!req.body.username || !req.body.accesskey) {
      res.status(400).send({ success: false, error: 'missing' });
      return;
    }

    const data = { hostname: req.body.server, username: req.body.username, password: req.body.accesskey }
    const sauceAccount = new SauceLabs(data);

    return sauceAccount.getAccountDetailsAsync().then(() => {
      return addon.settings.set('sauceAccount', data, req.clientInfo.clientKey).then(() => {
        getGlanceData(req.clientInfo.clientKey).then(data => hipchat.updateGlance(req.clientInfo, req.identity.roomId, 'sample.glance', data));
        res.json({ success: true });
      })
    }).catch(err => {
      console.log('err', err.body || err);
      res.status(400).send({ success: false, error: err.message });
      return;
    });
  });

  router.delete('/config', addon.authenticate(), function (req, res) {
    return addon.settings.del('sauceAccount', req.clientInfo.clientKey).then(() => {
      getGlanceData(req.clientInfo.clientKey).then(data => hipchat.updateGlance(req.clientInfo, req.identity.roomId, 'sample.glance', data));
      res.json({ success: true });
    })
  });

  // This is an example glance that shows in the sidebar
  // https://developer.atlassian.com/hipchat/guide/glances
  router.get('/glance', cors(), addon.authenticate(), function (req, res) {
    getGlanceData(req.clientInfo.clientKey).then(data => res.json(data));
  });

  // This is an example sidebar controller that can be launched when clicking on the glance.
  // https://developer.atlassian.com/hipchat/guide/dialog-and-sidebar-views/sidebar
  router.get('/sidebar', addon.authenticate(), function (req, res) {
    return getSauceAccount(req.clientInfo.clientKey).then(sauceAccount => {
      return sauceAccount.getJobsAsync().then(jobs => {
        return res.render('sidebar-jobs', {
          hostname: sauceAccount.options.hostname,
          identity: req.identity,
          jobs: jobs.map(job => cleanupJob(job))
        });
      });
    }).catch(() => {
      return res.render('signin', { sidebar: true });
    });
  });

  const _embed_dialog = (req, res, type) => {
    return getSauceAccount(req.clientInfo.clientKey)
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
  };
  router.get('/dialog/job/:jobId', addon.authenticate(), function (req, res) {
    return _embed_dialog(req, res, 'job');
  });
  router.get('/dialog/video/:jobId', addon.authenticate(), function (req, res) {
    return _embed_dialog(req, res, 'video');
  });

  router.get('/dialog/screenshots/:jobId', addon.authenticate(), function (req, res) {
    return getSauceAccount(req.clientInfo.clientKey)
      .then(sauceAccount => {
        return sauceAccount.showJobAsync(req.params.jobId)
          .then(job => cleanupJob(job))
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
  });

  // This is an example dialog controller that can be launched when clicking on the glance.
  // https://developer.atlassian.com/hipchat/guide/dialog-and-sidebar-views/dialog
  router.get('/dialog', addon.authenticate(), function (req, res) {
    res.render('dialog', {
      identity: req.identity
    });
  });

  router.post('/webhooks/sauce', addon.authenticate(), function(req, res) {
    getGlanceData(req.clientInfo.clientKey).then(data => hipchat.updateGlance(req.clientInfo, req.identity.roomId, 'sample.glance', data));
    hipchat.sendMessage(req.clientInfo, req.identity.roomId, 'Updating glance')
    res.sendStatus(200);
  });

  const messageUrlPattern = /https?:\/\/(?:[a-zA-Z0-9_-]+\.dev\.saucelabs\.net|saucelabs\.com)(?:\/beta)?\/tests\/([a-zA-Z0-9]{32})/;
  router.post('/webhooks/saucelabs_url', addon.authenticate(), function (req, res) {
    const message = req.body.item.message.message;
    const results = messageUrlPattern.exec(message);
    const id = results[1];
    if (!id) {
      // Not a valid url
      res.sendStatus(200);
      return;
    }

    const jobColorStatus = {
      'error': 'red',
      'failed': 'red',
      'passed': 'green',
      'complete': 'green'
      // in progress|running
    };

    return getSauceAccount(req.clientInfo.clientKey)
      .then(sauceAccount => {
        return sauceAccount.showJobAsync(id)
          .then(job => cleanupJob(job))
          .then(job => {
            return sauceAccount.showJobAssetsAsync(id).then(function(assets) {
              return sauceAccount.createPublicLinkAsync(id).then(function(publicUrl) {

                const attributes = [
                  { label: 'Owner', value: { label: job.owner } },
                  { label: 'Status', value: { label: job.consolidated_status } },
                  { label: 'Platform', value: { label: `${job.os} ${job.browser} ${job.browser_version}` } },
                  { label: 'Start', value: { label: moment(job.creation_time).format("lll") } },
                  { label: 'End', value: { label: moment(job.end_time).format("lll") } },
                  { label: 'Duration', value: { label: moment.duration(moment(job.end_time).diff(moment(job.creation_time))).humanize() } },
                  { label: 'Screenshot', value: { label: assets.screenshots.length ? "yes" : "no" } },
                  { label: 'Video', value: { label: assets.video ? "yes" : "no" } }
                ];
                var card = {
                  'style': 'application',
                  'id': uuid.v4(),
                  'metadata': { 'sauceJobId': id },
                  'format': 'medium',
                  'url': `https://${sauceAccount.options.hostname}/beta/tests/${id}`,
                  'title': job.name,
                  'attributes': attributes
                };

                if (assets.screenshots) { 
                  const image = assets.screenshots[assets.screenshots.length-1];
                  const auth = publicUrl.replace(/.*auth=([a-zA-Z0-9]+)/, '$1') ;
                  card.thumbnail = { 
                    url: `https://${sauceAccount.options.hostname}/rest/v1/${job.owner}/jobs/${job.id}/assets/${image}?auth=${auth}`
                  };
                }
                var msg = `<b>${card.title}</b>: <a href="${publicUrl}">Job Info</a>`;
                var opts = {
                  'options': {
                    'message_format': 'html',
                    'color': jobColorStatus[job.consolidated_status] || 'gray',
                    'message': msg
                  }
                };
                console.log('card', card);
                return hipchat.sendMessage(req.clientInfo, req.identity.roomId, msg, opts, card);
              });
            });
        });
      }).catch(err => {
        console.log('err', err);
        console.trace('unable to parse');
        hipchat.sendMessage(req.clientInfo, req.identity.roomId, `Unable to process url: ${err}`);
      }).then(() => res.json({}));
  });

  // Notify the room that the add-on was installed. To learn more about
  // Connect's install flow, check out:
  // https://developer.atlassian.com/hipchat/guide/installation-flow
  addon.on('installed', function (clientKey, clientInfo, req) {
    hipchat.sendMessage(clientInfo, req.body.roomId, 'The ' + addon.descriptor.name + ' add-on has been installed in this room');
  });

  // Clean up clients when uninstalled
  addon.on('uninstalled', function (id) {
    addon.settings.client.keys(id + ':*', function (err, rep) {
      rep.forEach(function (k) {
        addon.logger.info('Removing key:', k);
        addon.settings.client.del(k);
      });
    });
  });

  const updateAllGlances = () => {
    addon.settings.client.keys('*:clientInfo', function (err, keys) {
      keys.forEach(clientInfoStr => {
        let [clientKey] = clientInfoStr.split(':');
        addon.loadClientInfo(clientKey).then(clientInfo => {
          return getGlanceData(clientKey)
            .then(data => hipchat.updateGlance(clientInfo, { groupId: clientInfo.groupId }, 'sample.glance', data));
        });
      });
    });
  };
  updateAllGlances();
  setInterval(updateAllGlances, 30*1000);
};
