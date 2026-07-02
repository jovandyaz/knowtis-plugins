#!/usr/bin/env node
import { cpSync, mkdirSync, readdirSync, rmSync, existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const PLUGINS_DIR = join(ROOT, 'plugins');
const OUT = join(ROOT, 'dist', 'skills');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let count = 0;
for (const plugin of readdirSync(PLUGINS_DIR)) {
  const skillsDir = join(PLUGINS_DIR, plugin, 'skills');
  if (!existsSync(skillsDir) || !lstatSync(skillsDir).isDirectory()) continue;
  for (const skill of readdirSync(skillsDir)) {
    const src = join(skillsDir, skill);
    if (!lstatSync(src).isDirectory()) continue;
    const dest = join(OUT, skill);
    if (existsSync(dest)) {
      console.error(`✗ duplicate skill name across plugins: ${skill}`);
      process.exit(1);
    }
    cpSync(src, dest, { recursive: true });
    count += 1;
  }
}
console.log(`OK — exported ${count} skills to dist/skills/ (open Agent Skills format, consumable by OpenCode/Codex/Cursor)`);
