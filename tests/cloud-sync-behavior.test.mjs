import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

assert.match(
  app,
  /async function refreshCloudData\(\)/,
  'app should expose a shared cloud refresh helper'
);

assert.match(
  app,
  /async function switchDriverTab\(tab\)/,
  'driver tab switching should be async so it can await cloud refreshes'
);

assert.match(
  app,
  /else if \(tab === 'history'\) \{\s*await refreshCloudData\(\);/,
  'opening driver history should refresh cloud data before reading local storage'
);

assert.match(
  app,
  /else if \(tab === 'records'\) \{\s*await refreshCloudData\(\);/,
  'opening admin records should refresh cloud data before reading local storage'
);
