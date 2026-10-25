'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-ai-companions-import-'));
const fixture = path.join(temporary, 'repository');
const codexHome = path.join(temporary, 'custom codex home');
const script = path.join(fixture, 'scripts', 'import-pets.cjs');
const slugs = ['alpha-normal', 'beta-chibi'];
const files = ['pet.json', 'spritesheet.png'];

function run(...args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: temporary,
    env: { ...process.env, CODEX_HOME: codexHome },
    encoding: 'utf8',
  });
}

function destination(slug) {
  return path.join(codexHome, 'pets', `codex-ai-companions-${slug}`);
}

function assertMatches(slug) {
  for (const file of files) {
    assert.deepEqual(fs.readFileSync(path.join(destination(slug), file)),
      fs.readFileSync(path.join(fixture, 'pets', slug, file)));
  }
}

try {
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'import-pets.cjs'), script);
  for (const slug of slugs) {
    const source = path.join(fixture, 'pets', slug);
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, 'pet.json'), JSON.stringify({
      id: `codex-ai-companions-${slug}`,
      displayName: `测试 ${slug}`,
      description: 'Importer test fixture.',
      spriteVersionNumber: 2,
      spritesheetPath: 'spritesheet.png',
    }));
    // The importer copies bytes without decoding or changing the approved art.
    fs.writeFileSync(path.join(source, 'spritesheet.png'), Buffer.from(`fixture: ${slug}`));
  }

  let result = run('--help');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CODEX_HOME/);
  result = run('--list');
  assert.equal(result.status, 0, result.stderr);
  for (const slug of slugs) assert.match(result.stdout, new RegExp(slug));
  assert.equal(fs.existsSync(codexHome), false, 'Help/list must not create an installation.');

  result = run(slugs[0], 'missing-pet');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /未知角色/);
  assert.equal(fs.existsSync(codexHome), false, 'Unknown selection must not partially install.');
  result = run('--unknown');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /未知参数/);

  result = run(slugs[0]);
  assert.equal(result.status, 0, result.stderr);
  assertMatches(slugs[0]);
  assert.equal(fs.existsSync(destination(slugs[1])), false, 'Single selection must stay single.');

  const image = path.join(destination(slugs[0]), 'spritesheet.png');
  const before = fs.statSync(image).mtimeMs;
  result = run(slugs[0], slugs[0]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /已是当前版本/);
  assert.equal(fs.statSync(image).mtimeMs, before, 'Identical files should not be rewritten.');

  fs.writeFileSync(image, 'existing different content');
  result = run(slugs[1], slugs[0]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--force/);
  assert.equal(fs.readFileSync(image, 'utf8'), 'existing different content');
  assert.equal(fs.existsSync(destination(slugs[1])), false, 'Conflict must not partially install.');

  result = run('--force', slugs[0]);
  assert.equal(result.status, 0, result.stderr);
  assertMatches(slugs[0]);

  result = run();
  assert.equal(result.status, 0, result.stderr);
  for (const slug of slugs) assertMatches(slug);
  assert.equal(fs.readdirSync(path.join(codexHome, 'pets')).length, slugs.length);

  console.log('Pet importer tests passed: list/help, selection, repeat, conflict, force, all, invalid input.');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
