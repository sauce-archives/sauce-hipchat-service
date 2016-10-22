
var mixpanel;
if (process.env.MIXPANEL_CLIENT_ID) {
  var Mixpanel = require('mixpanel');
  // Use the mixpanel error handler to send exceptions to your mixpanel account
  mixpanel = Mixpanel.init(process.env.MIXPANEL_CLIENT_ID);
}

module.exports = mixpanel || {
  track: function track() { },
  people: {
    set: function set() { }
  }
}
