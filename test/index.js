/* eslint-env mocha */
require('should');
var uuid = require('uuid');
var request = require('supertest-as-promised');
var jwt = require('jsonwebtoken');

var app = require('../lib/app.js');

var fixtures = {
  clientInfo: require('./fixtures/clientInfo.json')
};

var makeRandomClient = function() {
  // clone
  var client = Object.assign({}, fixtures.clientInfo);
  client.clientKey = uuid.v4();
  client.oauthSecret = uuid.v4();
  return client;
};

var makeJWTPayload = function(clientInfo) {
  var now = Math.floor(Date.now() / 1000);
  var payload = {
    "exp": now + 600,
    "iss": clientInfo.clientKey,
    "prn": "client_id",
    "jti": uuid.v4(),
    "context": {
      "room_id": 3038073,
      "user_tz": "America/Los_Angeles"
    },
    "iat": now,
    "sub": "client_id"
  };
  return jwt.sign(payload, clientInfo.oauthSecret);
}

var hostname = (function() {
  if (process.env.AC_LOCAL_BASE_URL) {
    return require('url').parse(process.env.AC_LOCAL_BASE_URL).hostname;
  }
  return 'your-subdomain.herokuapp.com';
})();

describe("SauceForSlack", function() {
  it('random link sould 404', function() {
    return request(app).get('/random/link/goes/here').expect(404)
  });
  it('/healthcheck should return homepage', function() {
    return request(app).get('/healthcheck').expect(200).then(function (res) {
      var json = JSON.parse(res.text);
      json.should.have.property('status', 'OK');
      json.should.have.property('version');
    })
  });
  it('/ should return homepage', function() {
    return request(app)
      .get('/')
      .set('Host', hostname)
      .expect(200)
  });
  it('/config should return config page', async function() {
    var clientInfo = makeRandomClient();
    var payload = makeJWTPayload(clientInfo);
    await app.get('addon').settings.set('clientInfo', clientInfo, clientInfo.clientKey);
    return request(app)
      .get('/config')
      .query({
        signed_request: payload,
        xdmhost: `https://${hostname}`
      })
      .expect(200)
      .then(function (res) {
        return res.text.should.not.containEql("Successfully logged in");
      })
  });
  it('/config should return already logged in', async function() {
    var clientInfo = makeRandomClient();
    var payload = makeJWTPayload(clientInfo);
    var sauceAccount = { hostname: "fakeServer", username: "halkeye", password: "fakepassword" };
    await app.get('addon').settings.set('clientInfo', clientInfo, clientInfo.clientKey)
    await app.get('addon').settings.set('sauceAccount', sauceAccount, clientInfo.clientKey);
    return request(app)
      .get('/config')
      .query({
        signed_request: payload,
        xdmhost: `https://${hostname}`
      })
      .expect(200)
      .then(function (res) {
        return res.text.should.containEql("Successfully logged in");
      })
  });
});
