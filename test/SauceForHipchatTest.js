/* eslint-env mocha */
var path = require('path');
var uuid = require('uuid');
var nock = require('nock');
var sinon = require('sinon');

var SauceForHipchat = require('../lib/SauceForHipchat');

var fixtures = {
  clientInfo: require('./fixtures/clientInfo.json'),
  halkeyeJobsFull: require('./fixtures/halkeye-jobs-full.json'),
  halkeyeJob: require('./fixtures/halkeye-job.json')
};

var makeRandomClient = function() {
  // clone
  var client = Object.assign({}, fixtures.clientInfo);
  client.clientKey = uuid.v4();
  client.oauthSecret = uuid.v4();
  return client;
};

class FakeStore {

  constructor() {
    this.data = {};
  }

  get(key) {
    return Promise.resolve(this.data[key]);
  }

  set(key, value) {
    this.data[key] = value;
    return Promise.resolve();
  }

  del(key) {
    delete this.data[key];
    return Promise.resolve();
  }
}


describe("SauceForHipchat", function() {
	beforeEach(function () {
    this.addon = {
      settings: new FakeStore()
    };
    this.app = new SauceForHipchat(this.addon);
    this.app.hipchat = {
      updateGlance: sinon.spy(),
      sendMessage: sinon.spy()
    };

    this.req = {};
    this.req.clientInfo = makeRandomClient();
    this.req.identity = { groupId: 619153, roomId: 3123340, userId: 4259738 };
    this.req.params = {};
    this.req.body = {};
    this.res = {
      status: () => { return this.res; },
      send: sinon.spy(),
      json: sinon.spy(),
      render: sinon.spy()
    };

    nock.cleanAll();
    nock.disableNetConnect();
		nock('https://saucelabs.com')
			.get(/\/rest\/v1\/users\/(.*)$/)
			.reply(200, {});
		nock('https://saucelabs.com')
			.get(/\/rest\/v1\/([^/]+)\/jobs$/)
      .query({ full: true })
			.replyWithFile(200, path.join(__dirname, '/fixtures/halkeye-jobs-full.json'));
		nock('https://saucelabs.com')
			.get(/\/rest\/v1\/([^/]+)\/jobs\/[^/]+\/assets$/)
			.replyWithFile(200, path.join(__dirname, '/fixtures/halkeye-job-assets.json'));
		nock('https://saucelabs.com')
			.get(/^\/rest\/v1\/jobs\/[^/]+$/)
			.replyWithFile(200, path.join(__dirname, '/fixtures/halkeye-job.json'));
	});
  after(function () {
    nock.enableNetConnect();
    nock.cleanAll();
  });
  it('routerGetConfig should return config page', async function() {
    await this.app.routerGetConfig(this.req, this.res);
    this.res.render.getCall(0).args[0].should.eql('signin');
  });
  it('routerGetConfig should return already logged in', async function() {
    var sauceAccount = { username: "halkeye", password: "fakepassword" };
    await this.addon.settings.set('sauceAccount', sauceAccount, this.req.clientInfo.clientKey);

    await this.app.routerGetConfig(this.req, this.res);
    this.res.render.getCall(0).args[0].should.eql('alreadyLoggedIn');
  });

  it('routerPostConfig should save credentials', async function() {
    this.req.body = { username: "halkeye", accessKey: "fakepassword" };

    await this.app.routerPostConfig(this.req, this.res);
    this.res.json.calledOnce.should.eql(true);
    this.res.json.getCall(0).args[0].should.eql({ success: true });
    this.app.hipchat.updateGlance.calledOnce.should.eql(true);
    this.app.hipchat.updateGlance.getCall(0).args[1].should.eql(this.req.identity.roomId);
    this.app.hipchat.updateGlance.getCall(0).args[2].should.eql('saucelabs.glance');
    this.app.hipchat.updateGlance.getCall(0).args[3].should.eql({
      label: { type: 'html', value: 'Sauce Labs' }
    });
  });

  it('routerDeleteConfig', async function() {
    await this.app.routerDeleteConfig(this.req, this.res);

    this.res.json.calledOnce.should.eql(true);
    this.res.json.getCall(0).args[0].should.eql({ success: true });
    this.app.hipchat.updateGlance.calledOnce.should.eql(true);
    this.app.hipchat.updateGlance.getCall(0).args[1].should.eql(this.req.identity.roomId);
    this.app.hipchat.updateGlance.getCall(0).args[2].should.eql('saucelabs.glance');
    this.app.hipchat.updateGlance.getCall(0).args[3].should.eql({
      label: { type: 'html', value: 'Sauce Labs' },
      status: { type: 'lozenge', value: { label: 'Needs Login', type: 'error' } }
    });
  });

  it('routerGetGlance while logged in', async function() {
    var sauceAccount = { username: "halkeye", password: "fakepassword" };
    await this.addon.settings.set('sauceAccount', sauceAccount, this.req.clientInfo.clientKey);

    await this.app.routerGetGlance(this.req, this.res);

    this.res.json.calledOnce.should.eql(true);
    this.res.json.getCall(0).args[0].should.eql({
      label: { type: 'html', value: 'Sauce Labs' }
    });
  });

  it('routerGetGlance while not logged in', async function() {
    await this.app.routerGetGlance(this.req, this.res);

    this.res.json.calledOnce.should.eql(true);
    this.res.json.getCall(0).args[0].should.eql({
      label: { type: 'html', value: 'Sauce Labs' },
      status: { type: 'lozenge', value: { label: 'Needs Login', type: 'error' } }
    });
  });

  it('routerGetSidebar while logged in', async function() {
    var sauceAccount = { username: "halkeye", password: "fakepassword" };
    await this.addon.settings.set('sauceAccount', sauceAccount, this.req.clientInfo.clientKey);

    await this.app.routerGetSidebar(this.req, this.res);

    this.res.render.calledOnce.should.eql(true);
    this.res.render.getCall(0).args[0].should.eql('sidebar-jobs');
    this.res.render.getCall(0).args[1].hostname.should.eql('saucelabs.com');
    // confirm the creation and end times are in javascript format
    this.res.render.getCall(0).args[1].jobs[0].creation_time.should.eql(1474584479000);
    this.res.render.getCall(0).args[1].jobs[0].end_time.should.eql(1474584497000);
  });

  it('routerGetJob while logged in', async function() {
    var sauceAccount = { username: "halkeye", password: "fakepassword" };
    await this.addon.settings.set('sauceAccount', sauceAccount, this.req.clientInfo.clientKey);

    this.req.params.jobId = fixtures.halkeyeJobsFull[0].id;
    await this.app.routerGetJob(this.req, this.res);

    this.res.render.calledOnce.should.eql(true);
    this.res.render.getCall(0).args[0].should.eql('embed-dialog');
    this.res.render.getCall(0).args[1].should.have.keys('type', 'jobId', 'hostname', 'auth');
    this.res.render.getCall(0).args[1].type.should.eql('job');
    this.res.render.getCall(0).args[1].jobId.should.have.eql(this.req.params.jobId);
    this.res.render.getCall(0).args[1].hostname.should.have.eql('saucelabs.com');
  });

  it('routerGetVideo while logged in', async function() {
    var sauceAccount = { username: "halkeye", password: "fakepassword" };
    await this.addon.settings.set('sauceAccount', sauceAccount, this.req.clientInfo.clientKey);

    this.req.params.jobId = fixtures.halkeyeJobsFull[0].id;
    await this.app.routerGetVideo(this.req, this.res);

    this.res.render.calledOnce.should.eql(true);
    this.res.render.getCall(0).args[0].should.eql('embed-dialog');
    this.res.render.getCall(0).args[1].should.have.keys('type', 'jobId', 'hostname', 'auth');
    this.res.render.getCall(0).args[1].type.should.eql('video');
    this.res.render.getCall(0).args[1].jobId.should.have.eql(this.req.params.jobId);
    this.res.render.getCall(0).args[1].hostname.should.have.eql('saucelabs.com');
  });

  it('routerGetScreenshots while logged in', async function() {
    var sauceAccount = { username: "halkeye", password: "fakepassword" };
    await this.addon.settings.set('sauceAccount', sauceAccount, this.req.clientInfo.clientKey);

    this.req.params.jobId = fixtures.halkeyeJob.id;
    await this.app.routerGetScreenshots(this.req, this.res);

    this.res.render.calledOnce.should.eql(true);
    this.res.render.getCall(0).args[0].should.eql('screenshots-dialog');
    this.res.render.getCall(0).args[1].should.have.keys('job', 'hostname', 'auth', 'assets');
    this.res.render.getCall(0).args[1].hostname.should.have.eql('saucelabs.com');
    this.res.render.getCall(0).args[1].assets.should.have.eql({
      'sauce-log': 'log.json',
      video: 'video.flv',
      'selenium-log': 'selenium-server.log',
      screenshots: Array(7).fill(0).map((s, idx) => `000${idx}screenshot.png`)
    });
    // confirm the creation and end times are in javascript format
    this.res.render.getCall(0).args[1].job.creation_time.should.eql(1474584479000);
    this.res.render.getCall(0).args[1].job.end_time.should.eql(1474584497000);
  });

  /*
  it('routerPostWebhooksSauce', async function() {
    await this.app.routerPostWebhooksSauce(this.req, this.res);
    this.res.render.calledOnce.should.eql(true);
    this.res.render.getCall(0).args[0].should.eql('screenshots-dialog');
  });
  */
  describe('routerPostWebhooksUrl', function() {
    beforeEach(function() {
      this.req.body.item = {
        message: {
          message: `https://saucelabs.com/beta/tests/${fixtures.halkeyeJob.id}`
        }
      }
    });
    it('not logged in throws error', function() {
      return this.app.routerPostWebhooksUrl(this.req, this.res).should.be.rejectedWith(Error);
    });
    it('routerPostWebhooksUrl', async function() {
      var sauceAccount = { username: "halkeye", password: "fakepassword" };
      await this.addon.settings.set('sauceAccount', sauceAccount, this.req.clientInfo.clientKey);

      await this.app.routerPostWebhooksUrl(this.req, this.res);
      this.res.json.calledOnce.should.eql(true);
      this.res.json.getCall(0).args[0].should.eql({});

      this.app.hipchat.sendMessage.calledOnce.should.eql(true);
      this.app.hipchat.sendMessage.getCall(0).args[1].should.eql(this.req.identity.roomId);
      /* Plain text */
      this.app.hipchat.sendMessage.getCall(0).args[2].should.containEql(fixtures.halkeyeJob.name);
      /* options */
      Object.keys(this.app.hipchat.sendMessage.getCall(0).args[3]).should.eql(['message_format', 'color', 'message']);
      this.app.hipchat.sendMessage.getCall(0).args[3].message_format.should.eql('html');
      this.app.hipchat.sendMessage.getCall(0).args[3].color.should.eql('green');
      /* card */
      this.app.hipchat.sendMessage.getCall(0).args[4].should.eql(['message_format', 'color', 'message']);
    });
  });
});

