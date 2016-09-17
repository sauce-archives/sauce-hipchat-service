exports = {
  handleError: function() { }
}

if (process.env.ROLLBAR_SERVER_TOKEN) {
  var rollbar = require('rollbar');
  // Use the rollbar error handler to send exceptions to your rollbar account
  rollbar.init(process.env.ROLLBAR_SERVER_TOKEN)
  exports = rollbar
}

