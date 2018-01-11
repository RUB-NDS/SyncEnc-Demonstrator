require('babel-register');
var webpackDevMiddleware = require('webpack-dev-middleware');
var webpack = require('webpack');
var config = require('../../webpack.test.config');
var compiler = webpack(config);
var express = require('express');
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var app = express();
var http = require('http');

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
app.use(express.static('src/test'));
var server = http.createServer(app);
server.listen(8080);
console.log("Listing on http://localhost:8080");