require('babel-register');
var webpackDevMiddleware = require('webpack-dev-middleware');
var webpack = require('webpack');
var config = require('../../webpack.config');
var express = require('express');
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var app = express();
var compiler = webpack(config);
var WebSocket = require('ws');
var WebSocketJSONStream = require('websocket-json-stream');
var ShareDB = require('sharedb');
var xmlEnc = require('xml-enc');
var https = require('https');
var fs = require('fs');
ShareDB.types.register(xmlEnc.type);
var backend = new ShareDB();

const httpsOptions = {
    key: fs.readFileSync('privkey.pem'),
    cert: fs.readFileSync('cert.pem')
};

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
// pack the client libs and provide them with the server
app.use(webpackDevMiddleware(compiler, {
    publicPath: config.output.publicPath
}));

app.use(express.static('static'));
app.use(express.static('src/client/views'));

var server = https.createServer(httpsOptions, app);
var wss = new WebSocket.Server({server: server});
wss.on('connection', function (ws, req) {
    ws.on('error', console.error);
    var stream = new WebSocketJSONStream(ws);
    backend.listen(stream);
});

server.listen(8080);
console.log("Listing on https://localhost:8080");