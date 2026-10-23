'use strict';

/* eslint-disable no-console */

/**
 * Compiles app_custom_core client assets (js + scss).
 * Usage (from the repository root): npm run compile:custom
 */

var webpack = require('webpack');
var config = require('./webpack.config');

webpack(config, function (err, stats) {
    if (err) {
        console.error(err);
        process.exit(1);
    }

    console.log(stats.toString({ chunks: false, colors: true }));
    process.exit(stats.hasErrors() ? 1 : 0);
});
