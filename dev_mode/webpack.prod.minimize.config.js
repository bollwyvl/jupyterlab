const TerserPlugin = require('terser-webpack-plugin');
const merge = require('webpack-merge').default;
const WPPlugin = require('@jupyterlab/builder').WPPlugin;
const config = require('./webpack.config');

config[0] = merge(config[0], {
  mode: 'production',
  devtool: 'source-map',
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        parallel: true,
        sourceMap: true,
        terserOptions: {
          compress: false,
          ecma: 6,
          mangle: true,
          output: {
            beautify: false,
            comments: false
          },
          safari10: true
        },
        cache: process.platform !== 'win32'
      })
    ]
  },
  plugins: [
    new WPPlugin.JSONLicenseWebpackPlugin({
      excludedPackageTest: packageName =>
        packageName === '@jupyterlab/application-top'
    })
  ]
});

module.exports = config;
