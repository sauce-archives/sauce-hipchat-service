/* eslint no-console: 0 */
var cors = require('cors');
var url = require('url');
var router = require('express-promise-router')();
var SauceForHipchat = require('./SauceForHipchat');
var rollbar = require('./rollbar');

// This is the heart of your HipChat Connect add-on. For more information,
// take a look at https://developer.atlassian.com/hipchat/tutorials/getting-started-with-atlassian-connect-express-node-js
module.exports = function (app, addon) {
  var sauce = new SauceForHipchat(addon);

  app.use('/', router);

  // simple healthcheck
  router.get('/healthcheck', function (req, res) {
    res.json({ status: 'OK', version: require('../package.json').version });
  });

  router.get('/', function (req, res) {
    const homepage = url.parse(addon.descriptor.links.homepage);
    if (homepage.hostname === req.hostname && homepage.path === req.path) {
      res.render('homepage', Object.assign({}, addon.descriptor, {_key: addon.descriptor.key}));
    } else {
      res.redirect(addon.descriptor.links.homepage);
    }
  });

  router.get('/config', addon.authenticate(), sauce.routerGetConfig);
  router.post('/config', addon.authenticate(), sauce.routerPostConfig);
  router.delete('/config', addon.authenticate(), sauce.routerDeleteConfig);
  router.get('/glance', cors(), addon.authenticate(), sauce.routerGetGlance);
  router.get('/sidebar', addon.authenticate(), sauce.routerGetSidebar);
  router.get('/dialog/job/:jobId', addon.authenticate(), sauce.routerGetJob);
  router.get('/dialog/video/:jobId', addon.authenticate(), sauce.routerGetVideo);
  router.get('/dialog/screenshots/:jobId', addon.authenticate(), sauce.routerGetScreenshots);

  router.post('/webhooks/sauce', addon.authenticate(), sauce.routerPostWebhooksSauce);
  router.post('/webhooks/saucelabs_url', addon.authenticate(), sauce.routerPostWebhooksUrl);

  addon.on('installed', sauce.addonOnInstall);
  addon.on('uninstalled', sauce.addonOnUninstall);

  app.use(function(req, res, next){
    if (rollbar.handleError) {
      rollbar.handleError(new Error('Not Found'), req);
    }
    return res.status(404).send('Not found');
  });

  return {
    startPolling: () => {
      sauce.updateAllGlances();
      setInterval(sauce.updateAllGlances, 30*1000);
    }
  };
};
