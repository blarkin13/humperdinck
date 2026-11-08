import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(frontendRoot, '..');
const frontendPublic = resolve(frontendRoot, 'public');
const websiteAssets = resolve(repoRoot, 'website/assets');

test('all four studio theme logos exist and contain PNG data', () => {
  for (const variant of ['vintage-logo-dark', 'vintage-logo-light', 'modern-logo-dark', 'modern-logo-light']) {
    const file = resolve(frontendPublic, variant + '.png');
    assert.ok(existsSync(file), 'Missing studio logo: ' + file);
    assert.equal(readFileSync(file).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
});

test('marketing site uses the main logo, never the Vintage one', () => {
  // The website has no Vintage theme; Vintage artwork belongs to the app only.
  for (const filename of ['brand-modern.png', 'og-image.png']) {
    assert.ok(existsSync(resolve(websiteAssets, filename)), 'Missing website asset: ' + filename);
  }
  const html = readFileSync(resolve(repoRoot, 'website/index.html'), 'utf8');
  assert.match(html, /\/assets\/brand-modern\.png/);
  assert.doesNotMatch(html, /vintage-logo/);
});

test('public studio routes each color and theme to an existing logo', () => {
  const ui = readFileSync(resolve(frontendRoot, 'src.jsx'), 'utf8');
  const themeStyles = readFileSync(resolve(frontendRoot, 'themes.css'), 'utf8');
  for (const filename of ['vintage-logo-dark.png', 'vintage-logo-light.png', 'modern-logo-dark.png', 'modern-logo-light.png']) {
    assert.ok(ui.includes('/studio/' + filename), 'Missing public studio path: ' + filename);
  }
  assert.ok(themeStyles.includes('[data-theme="vintage"][data-mode="light"]'), 'Vintage light-mode image selector missing');
  assert.ok(themeStyles.includes('brand-mark-vintage-light'), 'Vintage light-mode logo class missing');
});
