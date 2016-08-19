var http = require('request');
var cors = require('cors');
var uuid = require('uuid');
var url = require('url');
var router = require('express-promise-router')();
var promisify = require('es6-promisify-all');
var SauceLabs = require('saucelabs');
var moment = require('moment');
var htmlEscape = require('escape-html');

SauceLabs.prototype = promisify(SauceLabs.prototype);
var sauceAccount = new SauceLabs({
  debug: 1,
  hostname: process.env.SAUCE_HOSTNAME,
  username: process.env.SAUCE_USERNAME,
  password: process.env.SAUCE_ACCESS_KEY
});

const cleanupJob = (job) => {
  return Object.assign({}, job, {
    creation_time: job.creation_time*1000,
    end_time: job.end_time*1000
  });
};


// This is the heart of your HipChat Connect add-on. For more information,
// take a look at https://developer.atlassian.com/hipchat/tutorials/getting-started-with-atlassian-connect-express-node-js
module.exports = function (app, addon) {
  var hipchat = require('../lib/hipchat')(addon);
  app.use('/', router);

  const getGlanceData = () => {
    return sauceAccount.getJobsAsync().then(jobs => {
      let data = {
        count: jobs.length,
        statuses: jobs.reduce(function(statusCount, job) {
          if (!statusCount[job.status]) { statusCount[job.status] = 0; }
          statusCount[job.status]++;
          return statusCount;
        }, {})
      };
      let ret = { 'label': { 'type': 'html', 'value': 'Sauce Labs' }, };
      if (data.statuses.new) {
        ret.status = {
          'type': 'lozenge',
          'value': { 'label': data.statuses.new + ' NEW', 'type': 'error' }
        };
      }
      console.log(data, ret);
      return ret;
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

  // This is an example route that's used by the default for the configuration page
  // https://developer.atlassian.com/hipchat/guide/configuration-page
  router.get('/config',
    // Authenticates the request using the JWT token in the request
    addon.authenticate(),
    function (req, res) {
      // The `addon.authenticate()` middleware populates the following:
      // * req.clientInfo: useful information about the add-on client such as the
      //   clientKey, oauth info, and HipChat account info
      // * req.context: contains the context data accompanying the request like
      //   the roomId
      res.render('config', req.context);
    });

  // This is an example glance that shows in the sidebar
  // https://developer.atlassian.com/hipchat/guide/glances
  router.get('/glance', cors(), addon.authenticate(), function (req, res) {
    getGlanceData().then(data => res.json(data));
  });

  // This is an example sidebar controller that can be launched when clicking on the glance.
  // https://developer.atlassian.com/hipchat/guide/dialog-and-sidebar-views/sidebar
  router.get('/sidebar', addon.authenticate(), function (req, res) {
    return sauceAccount.getJobsAsync().then(function(jobs) {
      res.render('sidebar-jobs', {
        hostname: sauceAccount.options.hostname,
        identity: req.identity,
        jobs: jobs.map(job => cleanupJob(job))
      });
    });
  });

  router.get('/dialog/video/:jobId', addon.authenticate(), function (req, res) {
    return sauceAccount.createPublicLinkAsync(req.params.jobId).then(function(url) {
      res.render('video-dialog', {
        identity: req.identity,
        jobId: req.params.jobId,
        hostname: sauceAccount.options.hostname,
        auth: url.replace(/.*auth=([a-zA-Z0-9]+)/, '$1')
      });
    });
  });

  router.get('/dialog/screenshots/:jobId', addon.authenticate(), function (req, res) {
    return sauceAccount.showJobAssetsAsync(req.params.jobId).then(function(assets) {
      return sauceAccount.createPublicLinkAsync(req.params.jobId).then(function(url) {
        res.render('screenshots-dialog', {
          assets: assets,
          identity: req.identity,
          jobId: req.params.jobId,
          hostname: sauceAccount.options.hostname,
          auth: url.replace(/.*auth=([a-zA-Z0-9]+)/, '$1')
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
    getGlanceData().then(data => hipchat.updateGlance(req.clientInfo, req.identity.roomId, 'sample.glance', data));
    hipchat.sendMessage(req.clientInfo, req.identity.roomId, 'Updating glance')
    res.sendStatus(200);
  });

  const messageUrlPattern = /https?:\/\/saucelabs.com\/beta\/tests\/([a-zA-Z0-9]{32})/;
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

    // console.log('req.clientInfo', req.clientInfo);
    // console.log('req.identity', req.clientInfo);
    return sauceAccount.showJobAsync(id)
      .then(job => cleanupJob(job))
      .then(job => {
        return sauceAccount.showJobAssetsAsync(id).then(function(assets) {
          var card = {
            'style': 'application',
            'id': uuid.v4(),
            'metadata': { 'jobId': id },
            'format': 'medium',
            'url': `https://${sauceAccount.options.hostname}/beta/tests/${id}`,
            'title': job.name,
            'description': {
              'format': 'html',
              'value': "<a href='#' data-target='job.video.dialog' data-target-options='" + htmlEscape(JSON.stringify({
                urlTemplateValues: { 'jobId': job.id }
              })) + "'>Video</a>"
            },
            'icon': { 'url': 'https://hipchat-public-m5.atlassian.com/assets/img/hipchat/bookmark-icons/favicon-192x192.png' },
            'attributes': [
              { label: 'Owner', value: { label: job.owner } },
              { label: 'Status', value: { label: job.consolidated_status } },
              { label: 'Platform', value: { label: `${job.os} ${job.browser} ${job.browser_version}` } },
              { label: 'Start Time', value: { label: moment(job.creation_time).format("lll") } },
              { label: 'End Time', value: { label: moment(job.end_time).format("lll") } },
              { label: 'Duration', value: { label: moment.duration(moment(job.end_time).diff(moment(job.creation_time))).humanize() } },
              { label: 'Has Screenshot(s)?', value: { label: assets.screenshots.length ? "yes" : "no" } },
              { label: 'Has Video?', value: { label: assets.video ? "yes" : "no" } }
            ]
          };

          var msg = '<b>' + card.title + '</b>: ' + card.description.value;
          var opts = {
            'options': {
              'message_format': 'html',
              'color': jobColorStatus[job.consolidated_status] || 'gray',
              'message': card.description.value
            }
          };
          console.log('card', card);
          return hipchat.sendMessage(req.clientInfo, req.identity.roomId, msg, opts, card);
        });
      });
  });

  // Notify the room that the add-on was installed. To learn more about
  // Connect's install flow, check out:
  // https://developer.atlassian.com/hipchat/guide/installation-flow
  addon.on('installed', function (clientKey, clientInfo, req) {
    console.log('clientKey', clientKey);
    console.log('clientInfo', clientInfo);
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
        let [clientId] = clientInfoStr.split(':');
        // hipchat.updateGlance(req.clientInfo, req.identity.roomId, 'sample.glance', sampleGlanceData);
        console.log(clientId);
      });
    });
  };
  updateAllGlances();
  setTimeout(updateAllGlances, 10*1000);
};
