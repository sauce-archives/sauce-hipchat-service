var http = require('http');
var app = require('./lib/app');

var port = app.get('port');
app.routes.startPolling();
// Boot the damn thing
http.createServer(app).listen(port, function(){
  console.log()
  console.log(`Add-on server running on ${port}`);
});
