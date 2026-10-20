// The app shares pure display rules with the website — expiry wording, list
// de-duplication, unit prices — by importing them straight from ../src/lib
// (alias `@shared/*` in tsconfig.json). One copy of each rule, so the app and
// the site cannot drift apart. Only PURE files may be imported that way: no
// Next.js, no Prisma, no browser globals, relative imports only.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../src/lib')];

module.exports = config;
