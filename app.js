// This is the entry point for your add-on, creating and configuring
// your add-on HTTP server

// [Express](http://expressjs.com/) is your friend -- it's the underlying
// web framework that `atlassian-connect-express` uses
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
var http = require('http');
var path = require('path');
var os = require('os');

ac.store.register('cloud_sql', require('./lib/store.js'));

// Anything in ./public is served up as static content
var staticDir = path.join(__dirname, 'public');
// Anything in ./views are HBS templates
var viewsDir = __dirname + '/views';
// Your routes live here; this is the C in MVC
var routes = require('./lib/routes');
// Bootstrap Express
var app = express();
// Bootstrap the `atlassian-connect-express` library
var addon = ac(app);
// You can set this in `config.js`
var port = addon.config.port();
// Declares the environment to use in `config.js`
var devEnv = app.get('env') == 'development';

// Load the HipChat AC compat layer
require('atlassian-connect-express-hipchat')(addon, app);

// The following settings applies to all environments
app.set('port', port);


// Configure the Handlebars view engine
app.engine('hbs', hbs.express3({partialsDir: viewsDir}));
app.set('view engine', 'hbs');
app.set('views', viewsDir);

if (devEnv) {
  const config = require('./webpack.config.js');
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

// Show nicer errors when in dev mode
if (process.env.ROLLBAR_SERVER_TOKEN) {
  var rollbar = require('rollbar');
  // Use the rollbar error handler to send exceptions to your rollbar account
  app.use(rollbar.errorHandler(process.env.ROLLBAR_SERVER_TOKEN));
} else if (devEnv) {
  app.use(errorHandler());
}

// Wire up your routes using the express and `atlassian-connect-express` objects
routes(app, addon);

// Boot the damn thing
http.createServer(app).listen(port, function(){
  console.log()
  console.log('Add-on server running at '+ (addon.config.localBaseUrl()||('http://' + (os.hostname()) + ':' + port)));
});
