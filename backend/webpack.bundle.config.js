const path = require('path');
const webpack = require('webpack');
const fs = require('fs');
const dotenv = require('dotenv');

const repoRoot = __dirname;
const envFilePath = path.resolve(repoRoot, '.env');
let fileEnv = {};
if (fs.existsSync(envFilePath)) {
  fileEnv = dotenv.parse(fs.readFileSync(envFilePath));
}

const defineEnv = Object.keys(fileEnv).reduce((acc, key) => {
  acc[`process.env.${key}`] = JSON.stringify(fileEnv[key]);
  return acc;
}, {});

const pkg = require(path.resolve(repoRoot, 'package.json'));
const externals = Object.keys(pkg.dependencies || {}).reduce((acc, dep) => {
  acc[dep] = 'commonjs ' + dep;
  return acc;
}, {});

module.exports = {
  mode: 'production',
  target: 'node',
  entry: path.resolve(repoRoot, 'dist', 'server.js'),
  output: {
    path: path.resolve(repoRoot, 'dist'),
    filename: 'bundle.js',
    libraryTarget: 'commonjs2'
  },
  resolve: { extensions: ['.js', '.ts'] },
  externals,
  plugins: [new webpack.DefinePlugin(defineEnv)]
};
