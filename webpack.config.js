var path = require('path');
var CleanWebpackPlugin = require('clean-webpack-plugin');

module.exports = {
    devtool: 'inline-source-map',
    entry: './src/client/js/OtExtender.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'OtExtender.bundle.js',
        //publicPath: '/dist'
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                use: [
                    {
                        loader: 'babel-loader',
                        options: {
                            presets: [['es2015', {'modules' : false}]],
                            plugins: ['babel-plugin-transform-class-properties']
                        }
                    }
                ]
            },
        ]
    },
    plugins: [
        new CleanWebpackPlugin(['dist']),
    ]
};