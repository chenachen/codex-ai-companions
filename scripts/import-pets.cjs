#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sourceRoot = path.resolve(__dirname, '..', 'pets');
const packageFiles = ['pet.json', 'spritesheet.png'];

function readIfPresent(file) {
  try {
    return fs.readFileSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function main() {
  const flags = new Set();
  const selected = new Set();
  for (const argument of process.argv.slice(2)) {
    if (['--help', '--list', '--force'].includes(argument)) flags.add(argument);
    else if (argument.startsWith('-')) throw new Error(`未知参数：${argument}。使用 --help 查看用法。`);
    else selected.add(argument);
  }

  if (flags.has('--help')) {
    console.log(`用法：node scripts/import-pets.cjs [--list] [--force] [角色目录名 ...]

不指定角色时导入全部；--list 列出角色；--force 更新同 ID 的已有素材。
安装目录：CODEX_HOME/pets，未设置 CODEX_HOME 时使用 ~/.codex/pets。

示例：
  node scripts/import-pets.cjs
  node scripts/import-pets.cjs deepseek-normal gpt-chibi
  node scripts/import-pets.cjs --force deepseek-normal`);
    return;
  }
  if (flags.has('--list') && (selected.size || flags.has('--force'))) {
    throw new Error('--list 不能与角色名或 --force 同时使用。');
  }

  const available = fs.readdirSync(sourceRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
  for (const slug of selected) {
    if (!available.includes(slug)) throw new Error(`未知角色：${slug}。使用 --list 查看可用角色。`);
  }

  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const slugs = selected.size ? [...selected] : available;
  const packages = slugs.map(slug => {
    const source = path.join(sourceRoot, slug);
    const contents = packageFiles.map(file => fs.readFileSync(path.join(source, file)));
    const manifest = JSON.parse(contents[0].toString('utf8'));
    if (!/^codex-ai-companions-[a-z0-9-]+$/.test(manifest.id)
      || typeof manifest.displayName !== 'string' || !manifest.displayName.trim()
      || manifest.spriteVersionNumber !== 2
      || manifest.spritesheetPath !== 'spritesheet.png') {
      throw new Error(`角色包格式不正确：${slug}/pet.json。`);
    }
    return { slug, contents, manifest, destination: path.resolve(codexHome, 'pets', manifest.id) };
  });

  if (flags.has('--list')) {
    for (const item of packages) console.log(`${item.slug}\t${item.manifest.displayName}`);
    return;
  }

  // Check the whole selection before writing, so an unknown or conflicting pet
  // cannot leave earlier entries in the same command partially installed.
  const conflicts = [];
  for (const item of packages) {
    const existing = packageFiles.map(file => readIfPresent(path.join(item.destination, file)));
    item.unchanged = existing.every((bytes, index) => bytes !== null && bytes.equals(item.contents[index]));
    if (!item.unchanged && fs.existsSync(item.destination) && !flags.has('--force')) {
      conflicts.push(item.slug);
    }
  }
  if (conflicts.length) {
    throw new Error(`已有不同内容：${conflicts.join('、')}。未写入任何素材；确认更新后加 --force。`);
  }

  for (const item of packages) {
    if (!item.unchanged) {
      fs.mkdirSync(item.destination, { recursive: true });
      packageFiles.forEach((file, index) => fs.writeFileSync(path.join(item.destination, file), item.contents[index]));
    }
    console.log(`${item.unchanged ? '已是当前版本' : '已导入'}：${item.manifest.displayName}\n  ${item.destination}`);
  }
  console.log('\n在 Codex 的 Settings > Pets 中点击 Refresh，选择角色；输入 /pet 显示宠物。');
}

try {
  main();
} catch (error) {
  console.error(`导入失败：${error.message}`);
  process.exitCode = 1;
}
