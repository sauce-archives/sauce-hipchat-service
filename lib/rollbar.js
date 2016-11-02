var rollbar;
if (process.env.ROLLBAR_SERVER_TOKEN) {
  rollbar = require('rollbar');
  // Use the rollbar error handler to send exceptions to your rollbar account
  rollbar.init(process.env.ROLLBAR_SERVER_TOKEN)
}

module.exports = rollbar || {
  handleError: function handleError() { }
}
