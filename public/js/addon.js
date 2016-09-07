/* global HipChat, $ */
/* add-on script */

$(document).ready(function () {
  
  //Register a listener for the dialog button - primary action "say Hello"
  HipChat.register({
    "dialog-button-click": function (event, closeDialog) {
      console.log('event.action', event.action);
      if (event.action === "sample.dialog.action") {
        //If the user clicked on the primary dialog action declared in the atlassian-connect.json descriptor:
      } else {
        //Otherwise, close the dialog
        closeDialog(true);
      }
    }
  });

});
