/* global HipChat, AP */
'use strict';

const React  = require('react');
const ReactDOM = require('react-dom');
const InlineSVG = require('svg-inline-react');  // CommonJS
const moment = require('moment');
const Slider = require('react-slick');
require('slick-carousel/slick/slick.scss');
require('slick-carousel/slick/slick-theme.scss');

const promisify = require('es6-promisify-all');
require('es6-promise').polyfill();
require('isomorphic-fetch');

require('../../public/js/rollbar.umd.nojson.min.js').init({
  accessToken: process.env.ROLLBAR_CLIENT_TOKEN,
  captureUncaught: true,
  captureUnhandledRejections: false,
  payload: { environment: process.env.NODE_ENV }
});

if (!window.HipChat) { window.HipChat = { auth: { withToken: () => {} }, register: () => {} }; }
if (HipChat.auth) {
  HipChat.auth = promisify(HipChat.auth);
}
if (HipChat.user) {
  HipChat.user = promisify(HipChat.user);
}

import AUIButton from 'aui-react/lib/AUIButton';
import AUIMessage from 'aui-react/lib/AUIMessage';

function checkStatus(response) {
  if (response.status >= 200 && response.status < 300) {
    return response
  } else {
    var error = new Error(response.statusText)
    error.response = response
    throw error
  }
}

function parseJSON(response) {
  return response.json()
}

function logout() {
  return HipChat.auth.withTokenAsync().then(token => {
    return fetch('/config', {
      method: 'DELETE',
      headers: { 'Authorization': 'JWT ' + token }
    }).then(checkStatus)
  })
}


class LogoutButton extends React.Component {
  constructor() {
    super();
    this.logout = this.logout.bind(this);
  }

  logout() {
    logout().then(() => window.location.reload())
  }

  render() {
    return <AUIButton type="primary" onClick={this.logout}>Logout</AUIButton>
  }
}

class Footer extends React.Component {
  constructor() {
    super();
    this.logout = this.logout.bind(this);
  }

  logout() {
    logout().then(() => window.location.reload())
  }

  render() {
    return (
      <footer className="aui-connect-footer">
        <div className="pull-right"><LogoutButton /></div>
      </footer>
    );
  }
}

class Config extends React.Component {
  static propTypes = {
  };

  constructor() {
    super();
    this.state = {
      hasError: false,
      username: "",
      accessKey: "",
      server: "saucelabs.com"
    };
    this.saveConfig = this.saveConfig.bind(this);
    this.handleFieldChange = this.handleFieldChange.bind(this);
  }

  handleFieldChange(event) {
    this.setState({[event.target.id]: event.target.value});
  }

  saveConfig(e) {
    e.preventDefault();
    return HipChat.auth.withTokenAsync().then(token => {
      return fetch('/config', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        body: JSON.stringify({ username: this.state.username, accessKey: this.state.accessKey, server: this.state.server })
      }).then(checkStatus).then(parseJSON)
    })
      .then(() => window.location.reload())
      .catch(() => this.setState({ hasError: true }));
  }


  closeSidebar() {
    AP.require('sidebar', function(sidebar) {
      sidebar.openView({ key: 'sidebar.joblist' });
    });
  }

  render() {
    return (
      <section className="aui-connect-page aui-connect-page-focused" role="main">
        <section className="aui-connect-content">
          <div className="aui-connect-content-inner">
            <img src="/img/logo.png" />
            <h1>Get the most out of Sauce Labs</h1>
            <p>Connect your account with Sauce Labs</p>
            { this.state.hasError && <AUIMessage type="error">Invalid Username or Access Key</AUIMessage>}
            <form className="aui top-label" id="signin">
              <div className="field-group">
                <label htmlFor="username">Username</label>
                <input className="text full-width-field" type="text" id="username" value={this.state.username} onChange={this.handleFieldChange} />
              </div>
              <div className="field-group">
                <label htmlFor="accessKey">Access Key</label>
                <input className="text full-width-field" type="text" id="accessKey" value={this.state.accessKey} onChange={this.handleFieldChange} />
              </div>
              <div className="field-group">
                <label htmlFor="server">Server</label>
                <input className="text full-width-field" type="text" id="server" value={this.state.server} onChange={this.handleFieldChange} />
              </div>
              <div className="aui-buttons">
                <button type="submit" className="aui-button aui-button-primary" onClick={this.saveConfig} id="signin-button">Sign In</button>
              </div>
            </form>
          </div>
        </section>
      </section>
    );
  }
}
class SidebarJob extends React.Component {
  static propTypes = {
    job: React.PropTypes.object.isRequired,
    hostname: React.PropTypes.string.isRequired
  };

  constructor() {
    super();
    this.postJob = this.postJob.bind(this);
    this.showVideo = this.showVideo.bind(this);
    this.showScreenshots = this.showScreenshots.bind(this);
    this.gotoExteralJobLink = this.gotoExteralJobLink.bind(this);
  }

  postJob() {
    return HipChat.auth.withTokenAsync().then(token => {
      return fetch('/webhooks/saucelabs_url', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + token
        },
        body: JSON.stringify({
          item: { message: { message: 'https://saucelabs.com/beta/tests/' + this.props.job.id } }
        }),
      }).then(checkStatus).then(parseJSON)
    }).catch(err => console.error('Error sending message': err))
  }

  showVideo() {
    HipChat.dialog.open({
      key: 'job.video.dialog',
      urlTemplateValues: {
        'jobId': this.props.job.id
      }
    });
  }

  showScreenshots() {
    HipChat.dialog.open({
      key: 'job.screenshots.dialog',
      urlTemplateValues: {
        'jobId': this.props.job.id
      }
    });
  }

  gotoExteralJobLink() {
    window.open(`https://${this.props.hostname}/beta/tests/${this.props.job.id}`)
  }

  render() {
    const {job} = this.props;
    return (
      <li className={`aui-connect-list-item list-item-sauce-status-${job.consolidated_status}`}>
        <span className="aui-avatar aui-avatar-xsmall">
          <span className={`aui-avatar-inner sauce-job-status sauce-job-status-${job.consolidated_status}`}>
            <InlineSVG src={require(`!!svg-inline!../../public/img/job_status/${job.consolidated_status}.svg`)} />
          </span>
        </span>
        <span className="aui-connect-list-item-title" onClick={this.gotoExteralJobLink}>{job.name}</span>
        <ul className="aui-connect-list-item-attributes">
          <li>Started: {moment(job.creation_time).format("lll")}</li>
        </ul>
        <ul className="aui-connect-list-item-attributes">
          <li>Duration: {moment.duration(moment(job.end_time).diff(moment(job.creation_time))).humanize()}</li>
        </ul>
        {/*<ul className="aui-connect-list-item-attributes">
          <li title={job.build || 'No Build'}
            style={{ 'whiteSpace': 'nowrap', 'overflow': 'hidden', 'textOverflow': 'ellipsis', 'maxWidth': '45%' }}>
            {job.build || 'No Build'}
          </li>
        </ul>*/}
        <div className="aui-connect-list-item-description">
          <p>
            <AUIButton onClick={this.showVideo}>
              <img style={{ height: '20px' }} src={require('../../public/img/icons/video.svg')} title="See Videos" alt="See Videos" />
            </AUIButton>
            <AUIButton onClick={this.showScreenshots}>
              <img style={{ height: '20px' }} src={require('../../public/img/icons/screenshot.svg')} title="See Screenshots" alt="See Screenshots" />
            </AUIButton>
            <AUIButton onClick={this.postJob}>
              <img style={{ height: '20px' }} src={require('../../public/img/icons/share.svg')} title="Share with chat" alt="Share with chat" />
            </AUIButton>
          </p>
        </div>
      </li>
    );
  }
}

class SidebarJobsList extends React.Component {
  static propTypes = {
    jobs: React.PropTypes.array.isRequired,
    hostname: React.PropTypes.string.isRequired
  };

  constructor() {
    super();
    this.state = { mode: 'all' };
    this.clickAll = this.clickNav.bind(this, 'all');
    this.clickFailed = this.clickNav.bind(this, 'failed');
    this.clickPassed = this.clickNav.bind(this, 'passed');
  }

  clickNav(mode) {
    this.setState({ mode: mode });
  }

  render() {
    const jobs = {
      all: this.props.jobs,
      failed: this.props.jobs.filter(job => ['failed', 'error'].indexOf(job.consolidated_status) !== -1),
      passed: this.props.jobs.filter(job => job.consolidated_status === 'passed')
    };

    return (
      <div>
        {/* Horizontal navigation tabs */}
        <nav className="aui-navgroup aui-navgroup-horizontal">
          <div className="aui-navgroup-inner">
            <div className="aui-navgroup-primary">
              <ul className="aui-nav">
                <li className={ this.state.mode === 'all' ? 'aui-nav-selected' : ''}><a onClick={this.clickAll} href="#">All ({jobs.all.length})</a></li>
                <li className={ this.state.mode === 'failed' ? 'aui-nav-selected' : ''}><a onClick={this.clickFailed} href="#">Failed ({jobs.failed.length})</a></li>
                <li className={ this.state.mode === 'passed' ? 'aui-nav-selected' : ''}><a onClick={this.clickPassed} href="#">Passed ({jobs.passed.length})</a></li>
              </ul>
            </div>
          </div>
        </nav>
        {/* Below here are three pairs of span/section elements corresponding to each of the tabs. The
         custom CSS in addon.css and JS in sidebar-page-switcher.js combine to provide a single
         page experience.*/}
        <section className="aui-connect-content with-list">
          <ol className="aui-connect-list">
            { jobs[this.state.mode].length === 0 ? 'No tests available' : '' }
            { jobs[this.state.mode].map(job => <SidebarJob key={job.id} job={job} hostname={this.props.hostname}/>) }
          </ol>
        </section>
      </div>
    );
  }
}

class DialogScreenshots extends React.Component {
  static propTypes = {
    screenshots: React.PropTypes.array.isRequired,
    job: React.PropTypes.object.isRequired,
    auth: React.PropTypes.string.isRequired,
    hostname: React.PropTypes.string.isRequired
  };

  constructor() {
    super();
    this.state = { index: 0 };
    this.images = this.images.bind(this);
  }

  images() {
    const {auth, job, hostname} = this.props;
    const images = this.props.screenshots.map(image => {
      return `https://${hostname}/rest/v1/${job.owner}/jobs/${job.id}/assets/${image}?auth=${auth}`;
    });
    return images;
  }

  render() {
    const settings = {
      dots: true,
      infinite: false,
      centerMode: true,
      speed: 500,
      slidesToShow: 1,
      slidesToScroll: 1,
    };

    return (
      <div>
        <Slider {...settings}>
          {
            this.images().map(image => {
              return (
                <div style={{ "maxWidth": "1024px", "maxHeight": "768px" }}>
                  <img src={image} style={{ "maxWidth": "1024px", "maxHeight": "768px" }} />
                </div>
              );
            })
          }
        </Slider>
      </div>
    );
  }
}

const entryMap = {
  'config': Config,
  'dialog-screenshots': DialogScreenshots,
  'logout-button': LogoutButton,
  'sauce-footer': Footer,
  'sidebar-jobs': SidebarJobsList
};

Object.keys(entryMap).forEach(id => {
  const elm = document.getElementById(id);
  if (!elm) { return; }

  const attrs = {};
  Object.keys(elm.dataset).forEach(key => {
    let attr = elm.dataset[key];
    try {
      attrs[key] = JSON.parse(attr);
    } catch (e) {
      attrs[key] = attr;
    }
  });

  ReactDOM.render(React.createElement(entryMap[id], attrs), elm);
});
