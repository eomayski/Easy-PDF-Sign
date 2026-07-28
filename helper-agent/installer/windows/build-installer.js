#!/usr/bin/env node
/**
 * Runs makensis with the version from package.json, so the installer exe and
 * the "Apps & features" entry carry it without anyone editing installer.nsi.
 * Same rule as everywhere else: package.json is the only place with a version.
 *
 * Run from helper-agent/ (npm run build:win-installer).
 */
const { execSync } = require('node:child_process');
const { version } = require('../../package.json');

execSync(`makensis /DVERSION=${version} installer/windows/installer.nsi`, {
  stdio: 'inherit',
});
