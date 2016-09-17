/* eslint-env mocha */
require('should');
var request = require('supertest-as-promised');
var app = require('../lib/app.js');
var jwt = require('jsonwebtoken');

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
  it('/config should return config page', function() {
    return request(app)
      .get('/config')
      .set('Authentication', jwt.sign(payload, 'superSecret'))
      .expect(200)
  });
});
