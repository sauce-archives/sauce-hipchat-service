var http = require('request');
var cors = require('cors');
var uuid = require('uuid');
var url = require('url');
var router = require('express-promise-router')();
var promisify = require('es6-promisify-all');
var SauceLabs = require('saucelabs');

SauceLabs.prototype = promisify(SauceLabs.prototype);
var sauceAccount = new SauceLabs({
  hostname: '***REMOVED***',
  username: 'admin',
  password: '***REMOVED***'
});

// This is the heart of your HipChat Connect add-on. For more information,
// take a look at https://developer.atlassian.com/hipchat/tutorials/getting-started-with-atlassian-connect-express-node-js
module.exports = function (app, addon) {
  var hipchat = require('../lib/hipchat')(addon);
  app.use('/', router);

  // simple healthcheck
  router.get('/healthcheck', function (req, res) {
    res.send('OK');
  });

  router.get('/gavin', function(req, res) {
    sauceAccount.createPublicLinkAsync('5efa2426576f44608b3774eefa38b6ba').then(function(assets) {
    //sauceAccount.showJobAssetsAsync('5efa2426576f44608b3774eefa38b6ba').then(function(assets) {
      res.json(assets);
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
            res.render('homepage', addon.descriptor);
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
    return sauceAccount.getJobsAsync().then(function(jobs) {
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
      res.json(ret);
    });
  });

  // This is an example sidebar controller that can be launched when clicking on the glance.
  // https://developer.atlassian.com/hipchat/guide/dialog-and-sidebar-views/sidebar
  router.get('/sidebar', addon.authenticate(), function (req, res) {
    const cleanupJob = (job) => {
      return Object.assign({}, job, { 
        creation_time: job.creation_time*1000 
      });
    };

    return sauceAccount.getJobsAsync().then(function(jobs) {
      res.render('sidebar-jobs', {
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
        auth: url.replace(/.*auth=([a-zA-Z0-9]+)/, '$1')
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

  // Sample endpoint to send a card notification back into the chat room
  // See https://developer.atlassian.com/hipchat/guide/sending-messages
  router.post('/send_notification',
    addon.authenticate(),
    function (req, res) {
      var card = {
        "style": "link",
        "url": "https://www.hipchat.com",
        "id": uuid.v4(),
        "title": req.body.messageTitle,
        "description": "Great teams use HipChat: Group and private chat, file sharing, and integrations",
        "icon": {
          "url": "https://hipchat-public-m5.atlassian.com/assets/img/hipchat/bookmark-icons/favicon-192x192.png"
        }
      };
      var msg = '<b>' + card.title + '</b>: ' + card.description;
      var opts = { 'options': { 'color': 'yellow' } };
      hipchat.sendMessage(req.clientInfo, req.identity.roomId, msg, opts, card);
      res.json({ status: "ok" });
    }
    );

  // This is an example route to handle an incoming webhook
  // https://developer.atlassian.com/hipchat/guide/webhooks
  router.post('/webhook',
    addon.authenticate(),
    function (req, res) {
      hipchat.sendMessage(req.clientInfo, req.identity.roomId, 'pong')
        .then(function (data) {
          res.sendStatus(200);
        });
    });

  const messageUrlPattern = /https?:\/\/saucelabs.com\/beta\/tests\/([a-zA-Z0-9]{32})/;

  router.post('/saucelabs_url', addon.authenticate(), function (req, res) {
    const message = req.body.item.message.message;
    const results = messageUrlPattern.exec(message);
    const id = results[1];
    if (!id) {
      // Not a valid url
      res.sendStatus(200);
      return;
    }

    // console.log('req.clientInfo', req.clientInfo);
    // console.log('req.identity', req.clientInfo);
    var card = {
      'style': 'application',
      'id': id,
      //'id': uuid.v4(),
      'metadata': {
        'jobId': id
      },
      'format': 'medium',
      'url': 'https://assets.saucelabs.com/jobs/' + id + '/video.flv',
      'title': 'THING TITLE',
      'description': 'This is a description of an application object.\nwith 2 lines of text',
      'icon': {
        'url': 'https://hipchat-public-m5.atlassian.com/assets/img/hipchat/bookmark-icons/favicon-192x192.png'
      },
      'attributes': [
        {
          'label': 'attribute1',
          'value': {
            'label': 'value1'
          }
        },
        {
          'label': 'attribute2',
          'value': {
            'icon': {
              'url': 'http://bit.ly/1S9Z5dF'
            },
            'label': 'value2',
            'style': 'lozenge-complete'
          }
        }
      ],
      'activity': {
        'html': "<a href='#' data-target='job.video.dialog'>View Video</a>"
      }
    };

    var msg = '<b>' + card.title + '</b>: ' + card.description;
    var opts = { 'options': { 'color': 'yellow' } };
    console.log('card', card);
    return hipchat.sendMessage(req.clientInfo, req.identity.roomId, msg, opts, card)
      .then(function (/*data*/) {
        res.sendStatus(200);
      });
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

};
