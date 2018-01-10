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
var http = require('http');

ShareDB.types.register(xmlEnc.type);
console.log('xmlEnc name: ' + xmlEnc.type.name + ' uri: ' + xmlEnc.type.uri);
var backend = new ShareDB();

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

var server = http.createServer(app);
var wss = new WebSocket.Server({server: server});
wss.on('connection', function (ws, req) {
    ws.on('error', console.error);
    var stream = new WebSocketJSONStream(ws);
    backend.listen(stream);
});

server.listen(3000);
console.log("Listing on http://localhost:3000");

var connection = backend.connect();
var doc = connection.get('test', 'xml-enc');

doc.fetch(function (err) {
    if (err) throw err;
    if (doc.type === null) {
        doc.create('<root><header/><document></document></root>', 'xml-enc');
    }
});