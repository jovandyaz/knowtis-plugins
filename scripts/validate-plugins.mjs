#!/usr/bin/env node
import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const PLUGINS_DIR = join(ROOT, 'plugins');
const failures = [];

const SECRET_PATTERNS = [
  [/sk-ant-[A-Za-z0-9_-]{8,}/, 'Anthropic API key'],
  [/postgres(ql)?:\/\/\w+:[^@\s*]+@/, 'connection string with credentials'],
  [/Bearer\s+[A-Za-z0-9._-]{20,}/, 'bearer token'],
  [/ghp_[A-Za-z0-9]{20,}/, 'GitHub PAT'],
];

function fail(msg) {
  failures.push(msg);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    fail(`${relative(ROOT, path)}: invalid JSON (${err.message})`);
    return null;
  }
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (lstatSync(path).isSymbolicLink()) {
      fail(`${relative(ROOT, path)}: symlink — plugins are cache-copied on install, symlinks break`);
      continue;
    }
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

function frontmatter(text, path) {
  if (!text.startsWith('---\n')) {
    fail(`${relative(ROOT, path)}: missing YAML frontmatter`);
    return null;
  }
  const end = text.indexOf('\n---', 4);
  if (end === -1) {
    fail(`${relative(ROOT, path)}: unterminated YAML frontmatter`);
    return null;
  }
  return text.slice(4, end);
}

function checkComponentFrontmatter(path) {
  const fm = frontmatter(readFileSync(path, 'utf8'), path);
  if (fm === null) return;
  for (const field of ['name:', 'description:']) {
    if (!fm.includes(field)) fail(`${relative(ROOT, path)}: frontmatter missing ${field.slice(0, -1)}`);
  }
}

function checkChangelogVersion(pluginDir, version) {
  const changelog = readFileSync(join(pluginDir, 'CHANGELOG.md'), 'utf8');
  const first = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m);
  if (!first) {
    fail(`${relative(ROOT, pluginDir)}/CHANGELOG.md: no "## [X.Y.Z]" entry`);
  } else if (first[1] !== version) {
    fail(`${relative(ROOT, pluginDir)}/CHANGELOG.md: first entry ${first[1]} != plugin.json version ${version}`);
  }
}

function checkTextContent(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const loc = `${relative(ROOT, path)}:${i + 1}`;
    for (const [re, label] of SECRET_PATTERNS) {
      if (re.test(line)) fail(`${loc}: possible ${label}`);
    }
    if (line.includes(homedir())) fail(`${loc}: absolute home path — plugins must be machine-portable`);
    if (path.includes('/hooks/') && line.includes('$CLAUDE_PROJECT_DIR')) {
      fail(`${loc}: hooks must use \${CLAUDE_PLUGIN_ROOT}, not $CLAUDE_PROJECT_DIR`);
    }
  });
}

function checkEvals(path) {
  const data = readJson(path);
  if (!data) return;
  const cases = Array.isArray(data) ? data : data.evals;
  if (!Array.isArray(cases) || cases.length < 3) {
    fail(`${relative(ROOT, path)}: expected an array of >=3 eval cases`);
    return;
  }
  cases.forEach((c, i) => {
    if (!c.query && !c.prompt) fail(`${relative(ROOT, path)}: case ${i} missing query/prompt`);
    if (!c.expected_behavior) fail(`${relative(ROOT, path)}: case ${i} missing expected_behavior`);
  });
}

const marketplace = readJson(join(ROOT, '.claude-plugin', 'marketplace.json'));
const registered = new Set();

if (marketplace) {
  if (marketplace.metadata?.pluginRoot) {
    fail(`marketplace.json: metadata.pluginRoot is not prepended to "./"-prefixed sources by the CLI — use full "./plugins/<name>" sources instead`);
  }
  for (const entry of marketplace.plugins ?? []) {
    registered.add(entry.name);
    if (entry.version) {
      fail(`marketplace.json: "${entry.name}" sets version — versions live only in plugin.json`);
    }
    if (!entry.category) {
      fail(`marketplace.json: "${entry.name}" missing category (belongs in the marketplace entry, not plugin.json)`);
    }
    const dir = join(ROOT, entry.source);
    const manifestPath = join(dir, '.claude-plugin', 'plugin.json');
    if (!existsSync(manifestPath)) {
      fail(`marketplace.json: "${entry.name}" source does not resolve to a plugin (${relative(ROOT, manifestPath)} missing)`);
      continue;
    }
    const manifest = readJson(manifestPath);
    if (manifest && manifest.name !== entry.name) {
      fail(`marketplace.json: entry "${entry.name}" != plugin.json name "${manifest.name}"`);
    }
  }
}

for (const name of existsSync(PLUGINS_DIR) ? readdirSync(PLUGINS_DIR) : []) {
  const dir = join(PLUGINS_DIR, name);
  if (!lstatSync(dir).isDirectory()) continue;
  if (!registered.has(name)) fail(`plugins/${name}: not registered in marketplace.json`);

  for (const required of ['.claude-plugin/plugin.json', 'README.md', 'CHANGELOG.md']) {
    if (!existsSync(join(dir, required))) fail(`plugins/${name}: missing ${required}`);
  }

  const manifest = readJson(join(dir, '.claude-plugin', 'plugin.json'));
  if (manifest) {
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? '')) {
      fail(`plugins/${name}: plugin.json version must be strict semver (got "${manifest.version}")`);
    } else if (existsSync(join(dir, 'CHANGELOG.md'))) {
      checkChangelogVersion(dir, manifest.version);
    }
    for (const field of ['description', 'author', 'license']) {
      if (!manifest[field]) fail(`plugins/${name}: plugin.json missing ${field}`);
    }
    if (manifest.category) {
      fail(`plugins/${name}: category belongs in the marketplace entry, not plugin.json (--strict rejects it)`);
    }
  }

  for (const path of walk(dir)) {
    if (path.endsWith('SKILL.md') || /\/agents\/[^/]+\.md$/.test(path)) checkComponentFrontmatter(path);
    if (path.endsWith('evals.json')) checkEvals(path);
    checkTextContent(path);
  }
}

if (failures.length > 0) {
  console.error(`FAIL — ${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('OK — marketplace and all plugins pass custom validation');
