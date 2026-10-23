'use strict';

/**
 * Standalone webpack configuration for app_custom_core client assets.
 * sgmf-scripts only compiles the cartridge named in the root package.json
 * ("packageName"), so this cartridge ships its own config.
 *
 * Entries: cartridge/client/<locale>/js/*.js     -> cartridge/static/<locale>/js/*.js
 *          cartridge/client/<locale>/scss/*.scss -> cartridge/static/<locale>/css/*.css
 * (files starting with "_" are partials and are not compiled on their own)
 */

var path = require('path');
var fs = require('fs');
var MiniCssExtractPlugin = require('mini-css-extract-plugin');
var RemoveEmptyScriptsPlugin = require('webpack-remove-empty-scripts');
var CssMinimizerPlugin = require('css-minimizer-webpack-plugin');

var projectRoot = path.resolve(__dirname, '../..');
var nodeModules = path.join(projectRoot, 'node_modules');
var clientRoot = path.join(__dirname, 'cartridge', 'client');
var staticRoot = path.join(__dirname, 'cartridge', 'static');

/**
 * Collects webpack entries for a given client asset type
 * @param {string} type - "js" or "scss"
 * @returns {Object} webpack entry map
 */
function collectEntries(type) {
    var entries = {};
    var extension = '.' + type;
    var targetDir = type === 'scss' ? 'css' : 'js';

    if (!fs.existsSync(clientRoot)) {
        return entries;
    }

    fs.readdirSync(clientRoot).forEach(function (locale) {
        var sourceDir = path.join(clientRoot, locale, type);
        if (!fs.existsSync(sourceDir)) {
            return;
        }
        fs.readdirSync(sourceDir).forEach(function (file) {
            if (path.extname(file) === extension && file.charAt(0) !== '_') {
                var name = [locale, targetDir, path.basename(file, extension)].join('/');
                entries[name] = path.join(sourceDir, file);
            }
        });
    });

    return entries;
}

var resolveConfig = {
    modules: [nodeModules, 'node_modules']
};

module.exports = [
    {
        mode: 'production',
        name: 'js',
        context: projectRoot,
        entry: collectEntries('js'),
        output: {
            path: staticRoot,
            filename: '[name].js'
        },
        resolve: resolveConfig,
        resolveLoader: resolveConfig,
        module: {
            rules: [
                {
                    test: /\.js$/,
                    exclude: /node_modules/,
                    use: {
                        loader: 'babel-loader',
                        options: {
                            presets: ['@babel/env'],
                            cacheDirectory: true
                        }
                    }
                }
            ]
        }
    },
    {
        mode: 'none',
        name: 'scss',
        context: projectRoot,
        entry: collectEntries('scss'),
        output: {
            path: staticRoot
        },
        resolve: resolveConfig,
        resolveLoader: resolveConfig,
        module: {
            rules: [
                {
                    test: /\.scss$/,
                    use: [
                        {
                            loader: MiniCssExtractPlugin.loader,
                            options: { esModule: false }
                        },
                        {
                            loader: 'css-loader',
                            options: { url: false }
                        },
                        {
                            loader: 'postcss-loader',
                            options: {
                                postcssOptions: {
                                    plugins: [require('autoprefixer')()]
                                }
                            }
                        },
                        {
                            loader: 'sass-loader',
                            options: {
                                implementation: require('sass'),
                                sassOptions: {
                                    includePaths: [nodeModules]
                                }
                            }
                        }
                    ]
                }
            ]
        },
        plugins: [
            new RemoveEmptyScriptsPlugin(),
            new MiniCssExtractPlugin({
                filename: '[name].css',
                chunkFilename: '[name].css'
            })
        ],
        optimization: {
            minimizer: ['...', new CssMinimizerPlugin()]
        }
    }
];
