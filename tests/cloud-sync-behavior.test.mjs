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

assert.match(
  app,
  /const APP_VERSION = '20260508d';/,
  'app should expose a version marker that mobile browsers can compare'
);

assert.match(
  app,
  /async function forceCloudSync\(\)/,
  'app should expose a manual cloud sync action for mobile cache recovery'
);

assert.match(
  app,
  /await clearRuntimeCaches\(\);/,
  'manual cloud sync should clear runtime caches before refreshing data'
);

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.match(
  index,
  /onclick="forceCloudSync\(\)"/,
  'settings should include a manual cloud sync button'
);

assert.match(
  index,
  /app\.js\?v=20260508d/,
  'index should request the new app bundle version'
);
