var express = require('express');
var bodyParser = require('body-parser');
var compression = require('compression');
var errorHandler = require('errorhandler');
var morgan = require('morgan');
// You need to load `atlassian-connect-express` to use her godly powers
var ac = require('atlassian-connect-express');
process.env.PWD = process.env.PWD || process.cwd(); // Fix expiry on Windows :(
// Static expiry middleware to help serve static resources efficiently
var expiry = require('static-expiry');
// We use [Handlebars](http://handlebarsjs.com/) as our view engine
// via [express-hbs](https://npmjs.org/package/express-hbs)
var hbs = require('express-hbs');
var HandlebarsIntl = require('handlebars-intl');
// We also need a few stock Node modules
var path = require('path');

ac.store.register('cloud_sql', require('./store.js'));

// Anything in ./public is served up as static content
var staticDir = path.join(__dirname, '../public');
// Anything in ./views are HBS templates
var viewsDir = path.join(__dirname, '../views');
// Your routes live here; this is the C in MVC
var routes = require('./routes');
// Bootstrap Express
var app = express();
// Bootstrap the `atlassian-connect-express` library
var addon = ac(app);
app.set('addon', addon);
// You can set this in `config.js`
var port = addon.config.port();
// Declares the environment to use in `config.js`
var devEnv = app.get('env') == 'development';
var rollbar = require('./rollbar');

// Load the HipChat AC compat layer
require('atlassian-connect-express-hipchat')(addon, app);

// The following settings applies to all environments
app.set('port', port);


// Configure the Handlebars view engine
app.engine('hbs', hbs.express3({partialsDir: viewsDir}));
app.set('view engine', 'hbs');
app.set('views', viewsDir);

if (devEnv) {
  const config = require('../webpack.config.js');
  const compiler = require('webpack')(config);
  const webpackDevMiddleware = require('webpack-dev-middleware');
  app.use(webpackDevMiddleware(compiler, {
    publicPath: config.output.publicPath,
    stats: 'errors-only'
    //stats: { colors: true }
  }));
}


// Declare any Express [middleware](http://expressjs.com/api.html#middleware) you'd like to use here
// Log requests, using an appropriate formatter by env
app.use(morgan(devEnv ? 'dev' : 'combined'));
// Include request parsers
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
// Gzip responses when appropriate
app.use(compression());
// Enable the ACE global middleware (populates res.locals with add-on related stuff)
app.use(addon.middleware());
// Enable static resource fingerprinting for far future expires caching in production
app.use(expiry(app, {dir: staticDir, debug: devEnv}));
// Add an hbs helper to fingerprint static resource urls
hbs.registerHelper('furl', function(url){ return app.locals.furl(url); });
hbs.registerHelper('svg', function(file) { return new hbs.SafeString(require('fs').readFileSync(file)); });
hbs.registerHelper('json', require('hbs-json'));
hbs.registerHelper('concat', function() {
  var arg = Array.prototype.slice.call(arguments,0);
  arg.pop();
  return arg.join('');
});
HandlebarsIntl.registerWith(hbs);

// Mount the static resource dir
app.use(express.static(staticDir));

if (rollbar.errorHandler) {
  app.use(rollbar.errorHandler(process.env.ROLLBAR_SERVER_TOKEN));
} else if (devEnv) {
  // Show nicer errors when in dev mode
  app.use(errorHandler());
}

// Wire up your routes using the express and `atlassian-connect-express` objects
routes(app, addon);

module.exports = app;
