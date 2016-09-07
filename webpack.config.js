var webpack = require('webpack');

module.exports = {
  devtool: 'cheap-source-map',
  entry: './lib/frontend/app.js',
  output: {
    path: __dirname + '/public',
    publicPath: '/',
    filename: 'js/bundle.js'
  },
  module: {
    loaders: [
      {
        test: /\.jsx?$/,
        loaders: [
          'babel'
        ],
        exclude: /node_modules|bower_components/
      },
      {
        test: /\.css$/,
        loaders: [
          'style',
          'css',
          'postcss'
        ]
      },
      {
        test: /\.scss$/,
        loaders: [
          'style',
          'css',
          'sass'
        ]
      },
      { test: /\.woff(2)?(\?v=[0-9]\.[0-9]\.[0-9])?$/, loader: 'url-loader?limit=10000&minetype=application/font-woff' },
      { test: /\.(ttf|eot|svg)(\?v=[0-9]\.[0-9]\.[0-9])?$/, loader: 'file-loader' },
      { test: /\.(gif|jpg|jpeg|png)$/, loader: 'file-loader' }
    ]
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      'process.env.ROLLBAR_CLIENT_TOKEN': JSON.stringify(process.env.ROLLBAR_CLIENT_TOKEN)
    }),
    //new webpack.ContextReplacementPlugin(/moment[\\\/]lang$/, /^\.\/(en)$/),
    new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
    new webpack.ProvidePlugin({
      'fetch': 'imports?this=>global!exports?global.fetch!whatwg-fetch'
    })
  ]
}
