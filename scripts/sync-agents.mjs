#!/usr/bin/env node
// Emits the marketplace's skills to the cross-tool `.agents/skills/` layout
// (read natively by Codex, Cursor, Gemini CLI, and OpenCode) plus an
// OpenCode-format knowtis-architect agent. Claude Code keeps consuming the
// plugins directly and does not read `.agents/`.
//
//   node scripts/sync-agents.mjs                    # emit to dist/
//   node scripts/sync-agents.mjs --install-repo <path>
//   node scripts/sync-agents.mjs --install-global   # ~/.agents/skills
//   node scripts/sync-agents.mjs --check <path>     # drift check, exit 1 on diff

import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  lstatSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const PLUGINS_DIR = join(ROOT, 'plugins');
const ARCHITECT_SRC = join(PLUGINS_DIR, 'domain', 'agents', 'knowtis-architect.md');
const MANIFEST_NAME = '.knowtis-plugins-manifest.json';

function collectSkills() {
  const skills = new Map();
  for (const plugin of readdirSync(PLUGINS_DIR)) {
    const skillsDir = join(PLUGINS_DIR, plugin, 'skills');
    if (!existsSync(skillsDir) || !lstatSync(skillsDir).isDirectory()) continue;
    const manifest = JSON.parse(
      readFileSync(join(PLUGINS_DIR, plugin, '.claude-plugin', 'plugin.json'), 'utf8')
    );
    for (const skill of readdirSync(skillsDir)) {
      const src = join(skillsDir, skill);
      if (!lstatSync(src).isDirectory()) continue;
      if (skills.has(skill)) {
        console.error(`✗ duplicate skill name across plugins: ${skill}`);
        process.exit(1);
      }
      skills.set(skill, { src, plugin, version: manifest.version });
    }
  }
  return skills;
}

function buildOpencodeAgent() {
  const text = readFileSync(ARCHITECT_SRC, 'utf8');
  const end = text.indexOf('\n---', 4);
  const frontmatter = text.slice(4, end);
  const body = text.slice(end + 4).trimStart();

  const descLines = [];
  let inDesc = false;
  for (const line of frontmatter.split('\n')) {
    if (line.startsWith('description:')) {
      inDesc = true;
      continue;
    }
    if (inDesc) {
      if (!line.startsWith('  ') || line.trim().startsWith('<example>')) break;
      if (line.trim()) descLines.push(line.trim());
    }
  }
  const description = descLines.join(' ');

  return [
    '---',
    `description: ${description}`,
    'mode: subagent',
    'tools:',
    '  write: false',
    '  edit: false',
    '  bash: false',
    '---',
    '',
    body,
  ].join('\n');
}

function emit(outDir) {
  const skillsOut = join(outDir, '.agents', 'skills');
  mkdirSync(skillsOut, { recursive: true });
  const skills = collectSkills();
  const manifest = {};
  for (const [name, { src, plugin, version }] of skills) {
    rmSync(join(skillsOut, name), { recursive: true, force: true });
    cpSync(src, join(skillsOut, name), { recursive: true });
    manifest[name] = `${plugin}@${version}`;
  }
  writeFileSync(join(skillsOut, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + '\n');

  const agentsOut = join(outDir, '.opencode', 'agents');
  mkdirSync(agentsOut, { recursive: true });
  writeFileSync(join(agentsOut, 'knowtis-architect.md'), buildOpencodeAgent());

  return skills.size;
}

function installSkills(targetSkillsDir) {
  mkdirSync(targetSkillsDir, { recursive: true });
  const manifestPath = join(targetSkillsDir, MANIFEST_NAME);
  const owned = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};

  const skills = collectSkills();
  const manifest = {};
  for (const [name, { src, plugin, version }] of skills) {
    const dest = join(targetSkillsDir, name);
    if (existsSync(dest) && !(name in owned)) {
      console.error(`✗ ${relative(homedir(), dest)} exists but was not installed by knowtis-plugins — refusing to overwrite`);
      process.exit(1);
    }
    rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
    manifest[name] = `${plugin}@${version}`;
  }
  for (const stale of Object.keys(owned).filter((n) => !skills.has(n))) {
    rmSync(join(targetSkillsDir, stale), { recursive: true, force: true });
    console.log(`  removed stale skill: ${stale}`);
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return skills.size;
}

function* walkFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(path);
    else yield path;
  }
}

function check(targetSkillsDir) {
  const skills = collectSkills();
  const drift = [];
  for (const [name, { src }] of skills) {
    const dest = join(targetSkillsDir, name);
    if (!existsSync(dest)) {
      drift.push(`${name}: not installed`);
      continue;
    }
    for (const file of walkFiles(src)) {
      const rel = relative(src, file);
      const installed = join(dest, rel);
      if (!existsSync(installed) || readFileSync(installed, 'utf8') !== readFileSync(file, 'utf8')) {
        drift.push(`${name}/${rel}: differs from source`);
      }
    }
  }
  if (drift.length > 0) {
    console.error(`DRIFT — ${drift.length} difference(s):`);
    for (const d of drift) console.error(`  ✗ ${d}`);
    process.exit(1);
  }
  console.log(`OK — ${skills.size} skills in sync at ${targetSkillsDir}`);
}

const [mode, arg] = process.argv.slice(2);

if (mode === '--install-repo') {
  if (!arg || !existsSync(arg)) {
    console.error('usage: sync-agents.mjs --install-repo <repo-path>');
    process.exit(1);
  }
  const count = installSkills(join(arg, '.agents', 'skills'));
  const agentsOut = join(arg, '.opencode', 'agents');
  mkdirSync(agentsOut, { recursive: true });
  writeFileSync(join(agentsOut, 'knowtis-architect.md'), buildOpencodeAgent());
  console.log(`OK — ${count} skills → ${arg}/.agents/skills, architect agent → ${arg}/.opencode/agents`);
} else if (mode === '--install-global') {
  const count = installSkills(join(homedir(), '.agents', 'skills'));
  console.log(`OK — ${count} skills → ~/.agents/skills (read by Codex, Cursor, Gemini, OpenCode)`);
} else if (mode === '--check') {
  if (!arg) {
    console.error('usage: sync-agents.mjs --check <repo-path|skills-dir>');
    process.exit(1);
  }
  const dir = existsSync(join(arg, '.agents', 'skills')) ? join(arg, '.agents', 'skills') : arg;
  check(dir);
} else if (mode === undefined) {
  const count = emit(join(ROOT, 'dist'));
  console.log(`OK — ${count} skills → dist/.agents/skills, architect agent → dist/.opencode/agents`);
} else {
  console.error('usage: sync-agents.mjs [--install-repo <path> | --install-global | --check <path>]');
  process.exit(1);
}
