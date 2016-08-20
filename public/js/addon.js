/* global HipChat, $, AP */
/* add-on script */

$(document).ready(function () {
  
  $('#signin').submit(function(e) {
    e.preventDefault();
    HipChat.auth.withToken(function(err, token) {
      if (err) { alert('FIXME - error getting token'); return; }
      $.ajax({
        type: 'POST',
        url: '/config',
        dataType: 'json',
        contentType: 'application/json',
        data: JSON.stringify({
          username: $('#username').val(),
          accesskey: $('#accesskey').val(),
          server: $('#server').val()
        }),
        headers: { 'Authorization': 'JWT ' + token },
      }).then(function() {
        AP.require('sidebar', function(sidebar) {
          sidebar.openView({ key: 'sidebar.joblist' });
        });
      }).fail(function(err) {
        console.log('err', err);
        // FIXME - do something like add has-error class to wrappers
      });
    });
  });

  /* Functions used by dialog.hbs */

  //Register a listener for the dialog button - primary action "say Hello"
  HipChat.register({
    "dialog-button-click": function (event, closeDialog) {
      if (event.action === "sample.dialog.action") {
        //If the user clicked on the primary dialog action declared in the atlassian-connect.json descriptor:
        sayHello(function (error) {
          if (!error)
            closeDialog(true);
          else
            console.log('Could not send message');
        });
      } else {
        //Otherwise, close the dialog
        closeDialog(true);
      }
    }
  });

});
