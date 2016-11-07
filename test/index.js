/* eslint-env mocha */
var sinon = require('sinon');
var request = require('supertest-as-promised');

var app = require('../lib/app.js');

describe('Express Gets Configured', function() {
  it('should get the event', function() {
    return app.waitConfiguredAsync().should.be.fulfilled();
  });
});
app.waitConfiguredAsync().then(function() {
  describe("Express App", function() {
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
        .expect(200)
    });
  });
});
