const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const projectRoot = __dirname
  .split(/[\\/]/)
  .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('[\\\\/]');

// Exclude generated projects both during crawling and absolute-path watch events.
config.resolver.blockList = [
  ...config.resolver.blockList,
  new RegExp(
    `^(?:${projectRoot}[\\\\/])?(?:\\.pnpm-store|sites|output|outputs|dist)(?:[\\\\/]|$)`,
  ),
];

module.exports = config;
