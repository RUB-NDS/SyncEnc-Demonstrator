var path = require('path');
var CleanWebpackPlugin = require('clean-webpack-plugin');

module.exports = {
    devtool: 'inline-source-map',
    entry: './src/test/xmlWrapperTest.js',
    output: {
        path: path.resolve(__dirname, 'src/test/dist'),
        filename: 'xmlWrapperTest.js',
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                use: [
                    {
                        loader: 'babel-loader',
                        options: {
                            presets: [['es2015', {'modules': false}]],
                            plugins: ['babel-plugin-transform-class-properties']
                        }
                    }
                ]
            }
        ]
    },
    plugins: [
        new CleanWebpackPlugin(['src/test/dist']),
    ]
};