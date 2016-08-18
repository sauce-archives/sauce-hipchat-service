/* global HipChat, $ */
'use strict';

const React  = require('react');
const ReactDOM = require('react-dom');
const InlineSVG = require('svg-inline-react');  // CommonJS
const moment = require('moment');


class SidebarJob extends React.Component {
  static propTypes = {
    job: React.PropTypes.object.isRequired
  };

  constructor() {
    super();
    this.postJob = this.postJob.bind(this);
  }

  postJob() {
    HipChat.auth.withToken((err, token) => {
      if (err) { return; }

      $.ajax({
        type: 'POST',
        url: '/webhooks/saucelabs_url',
        dataType: 'json',
        contentType: 'application/json',
        data: JSON.stringify({ item: { message: { message: 'https://saucelabs.com/beta/tests/' + this.props.job.id } } }),
        headers: { 'Authorization': 'JWT ' + token },
      });
    });
  }

  render() {
    const {job} = this.props;
    return (
      <li className={`aui-connect-list-item list-item-sauce-status-${job.consolidated_status}`}>
        <div className="aui-connect-list-item-actions">
          <button className="aui-dropdown2-trigger aui-button aui-dropdown2-trigger-arrowless" aria-owns={`list-item-${job.id}`}
            aria-haspopup="true" id={`list-item-${job.id}-action-menu`} data-no-focus="true">
            <span className="aui-icon aui-icon-small aui-iconfont-more"></span>
          </button>
          <div id={`list-item-${job.id}`} className="aui-style-default aui-dropdown2 aui-connect-list-item-action">
            <ul className="aui-list-truncate">
              <li><a onClick={this.postJob} href="#">Share with chat</a></li>
            </ul>
          </div>
        </div>
        <span className="aui-avatar aui-avatar-xsmall">
          <span className={`aui-avatar-inner sauce-job-status sauce-job-status-${job.consolidated_status}`}>
            <InlineSVG src={require(`svg-inline!../../public/img/job_status/${job.consolidated_status}.svg`)} />
          </span>
        </span>
        <span className="aui-connect-list-item-title">{job.name}</span>
        <ul className="aui-connect-list-item-attributes">
          <li>{moment(job.creation_time).format("lll")}</li>
          <li title={job.build || 'No Build'}
            style={{ 'whiteSpace': 'nowrap', 'overflow': 'hidden', 'textOverflow': 'ellipsis', 'maxWidth': '45%' }}>
            {job.build || 'No Build'}
          </li>
        </ul>
        <div className="aui-connect-list-item-description">
          List view descriptions are optional.
        </div>
      </li>
    );
  }
}

class SidebarJobsList extends React.Component {
  static propTypes = {
    jobs: React.PropTypes.array.isRequired
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
      failed: this.props.jobs.filter(job => job.consolidated_status === 'failed'),
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
            { jobs[this.state.mode].map(job => <SidebarJob key={job.id} job={job} />) }
          </ol>
        </section>
      </div>
    );
  }
}


const entryMap = { 'sidebar-jobs': SidebarJobsList };

const id = Object.keys(entryMap).find(id => document.getElementById(id));
const elm = document.getElementById(id);

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
