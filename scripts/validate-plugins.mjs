#!/usr/bin/env node
import { readFileSync, readdirSync, lstatSync, existsSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const PLUGINS_DIR = join(ROOT, "plugins");
const failures = [];
const skillNames = new Map();
const SKILL_FIELDS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
  "disable-model-invocation",
]);

const SECRET_PATTERNS = [
  [/sk-ant-[A-Za-z0-9_-]{8,}/, "Anthropic API key"],
  [/postgres(ql)?:\/\/\w+:[^@\s*]+@/, "connection string with credentials"],
  [/Bearer\s+[A-Za-z0-9._-]{20,}/, "bearer token"],
  [/ghp_[A-Za-z0-9]{20,}/, "GitHub PAT"],
];

function fail(msg) {
  failures.push(msg);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    fail(`${relative(ROOT, path)}: invalid JSON (${err.message})`);
    return null;
  }
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (lstatSync(path).isSymbolicLink()) {
      fail(
        `${relative(ROOT, path)}: symlink — plugins are cache-copied on install, symlinks break`,
      );
      continue;
    }
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

function frontmatter(text, path) {
  if (!text.startsWith("---\n")) {
    fail(`${relative(ROOT, path)}: missing YAML frontmatter`);
    return null;
  }
  const end = text.indexOf("\n---", 4);
  if (end === -1) {
    fail(`${relative(ROOT, path)}: unterminated YAML frontmatter`);
    return null;
  }
  return text.slice(4, end);
}

function checkComponentFrontmatter(path) {
  const fm = frontmatter(readFileSync(path, "utf8"), path);
  if (fm === null) return;
  for (const field of ["name:", "description:"]) {
    if (!fm.includes(field))
      fail(
        `${relative(ROOT, path)}: frontmatter missing ${field.slice(0, -1)}`,
      );
  }
}

function checkSkill(path) {
  const text = readFileSync(path, "utf8");
  const fm = frontmatter(text, path);
  if (fm === null) return;

  const rel = relative(ROOT, path);
  const fields = Array.from(
    fm.matchAll(/^([a-z][a-z0-9-]*):/gm),
    (match) => match[1],
  );
  for (const field of fields) {
    if (!SKILL_FIELDS.has(field))
      fail(`${rel}: unsupported frontmatter field ${field}`);
  }

  const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (!name) {
    fail(`${rel}: frontmatter missing name`);
  } else {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
      fail(`${rel}: invalid Agent Skills name "${name}"`);
    }
    if (name !== basename(dirname(path))) {
      fail(`${rel}: name "${name}" must match parent directory`);
    }
    if (skillNames.has(name)) {
      fail(`${rel}: duplicate skill name also used by ${skillNames.get(name)}`);
    } else {
      skillNames.set(name, rel);
    }
  }

  if (!description || description.length > 1024) {
    fail(
      `${rel}: description must contain 1-1024 characters on its declaration line`,
    );
  }
  if (!/^license:\s*MIT$/m.test(fm)) {
    fail(`${rel}: frontmatter license must be MIT`);
  }
  if (text.split("\n").length > 500) fail(`${rel}: SKILL.md exceeds 500 lines`);

  for (const match of text.matchAll(
    /\]\(((?:references|scripts|assets)\/[^)#]+)(?:#[^)]+)?\)/g,
  )) {
    if (!existsSync(join(dirname(path), match[1]))) {
      fail(`${rel}: missing linked resource ${match[1]}`);
    }
  }
}

function checkChangelogVersion(pluginDir, version) {
  const changelog = readFileSync(join(pluginDir, "CHANGELOG.md"), "utf8");
  const first = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m);
  if (!first) {
    fail(`${relative(ROOT, pluginDir)}/CHANGELOG.md: no "## [X.Y.Z]" entry`);
  } else if (first[1] !== version) {
    fail(
      `${relative(ROOT, pluginDir)}/CHANGELOG.md: first entry ${first[1]} != plugin.json version ${version}`,
    );
  }
}

function checkTextContent(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const loc = `${relative(ROOT, path)}:${i + 1}`;
    for (const [re, label] of SECRET_PATTERNS) {
      if (re.test(line)) fail(`${loc}: possible ${label}`);
    }
    if (line.includes(homedir()))
      fail(`${loc}: absolute home path — plugins must be machine-portable`);
    if (path.includes("/hooks/") && line.includes("$CLAUDE_PROJECT_DIR")) {
      fail(
        `${loc}: hooks must use \${CLAUDE_PLUGIN_ROOT}, not $CLAUDE_PROJECT_DIR`,
      );
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
  const ids = new Set();
  cases.forEach((c, i) => {
    if (!c.query && !c.prompt)
      fail(`${relative(ROOT, path)}: case ${i} missing query/prompt`);
    if (
      !Array.isArray(c.expected_behavior) ||
      c.expected_behavior.length === 0
    ) {
      fail(
        `${relative(ROOT, path)}: case ${i} missing expected_behavior entries`,
      );
    }
    if (c.id === undefined || ids.has(c.id)) {
      fail(`${relative(ROOT, path)}: case ${i} has a missing or duplicate id`);
    }
    ids.add(c.id);
  });

  const skillName = basename(dirname(dirname(path)));
  if (!Array.isArray(data) && data.skill !== skillName) {
    fail(
      `${relative(ROOT, path)}: skill "${data.skill}" must match directory "${skillName}"`,
    );
  }
}

const marketplace = readJson(join(ROOT, ".claude-plugin", "marketplace.json"));
const registered = new Set();

if (marketplace) {
  if (marketplace.metadata?.pluginRoot) {
    fail(
      `marketplace.json: metadata.pluginRoot is not prepended to "./"-prefixed sources by the CLI — use full "./plugins/<name>" sources instead`,
    );
  }
  for (const entry of marketplace.plugins ?? []) {
    registered.add(entry.name);
    if (entry.version) {
      fail(
        `marketplace.json: "${entry.name}" sets version — versions live only in plugin.json`,
      );
    }
    if (!entry.category) {
      fail(
        `marketplace.json: "${entry.name}" missing category (belongs in the marketplace entry, not plugin.json)`,
      );
    }
    const dir = join(ROOT, entry.source);
    const manifestPath = join(dir, ".claude-plugin", "plugin.json");
    if (!existsSync(manifestPath)) {
      fail(
        `marketplace.json: "${entry.name}" source does not resolve to a plugin (${relative(ROOT, manifestPath)} missing)`,
      );
      continue;
    }
    const manifest = readJson(manifestPath);
    if (manifest && manifest.name !== entry.name) {
      fail(
        `marketplace.json: entry "${entry.name}" != plugin.json name "${manifest.name}"`,
      );
    }
  }
}

for (const name of existsSync(PLUGINS_DIR) ? readdirSync(PLUGINS_DIR) : []) {
  const dir = join(PLUGINS_DIR, name);
  if (lstatSync(dir).isSymbolicLink()) {
    fail(`plugins/${name}: top-level plugin directory must not be a symlink`);
    continue;
  }
  if (!lstatSync(dir).isDirectory()) continue;
  if (!registered.has(name))
    fail(`plugins/${name}: not registered in marketplace.json`);

  for (const required of [
    ".claude-plugin/plugin.json",
    "README.md",
    "CHANGELOG.md",
  ]) {
    if (!existsSync(join(dir, required)))
      fail(`plugins/${name}: missing ${required}`);
  }

  const manifest = readJson(join(dir, ".claude-plugin", "plugin.json"));
  if (manifest) {
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? "")) {
      fail(
        `plugins/${name}: plugin.json version must be strict semver (got "${manifest.version}")`,
      );
    } else if (existsSync(join(dir, "CHANGELOG.md"))) {
      checkChangelogVersion(dir, manifest.version);
    }
    for (const field of ["description", "author", "license"]) {
      if (!manifest[field])
        fail(`plugins/${name}: plugin.json missing ${field}`);
    }
    if (manifest.license !== "MIT") {
      fail(`plugins/${name}: plugin.json license must be MIT`);
    }
    if (manifest.category) {
      fail(
        `plugins/${name}: category belongs in the marketplace entry, not plugin.json (--strict rejects it)`,
      );
    }
  }

  for (const path of walk(dir)) {
    if (path.endsWith("SKILL.md")) checkSkill(path);
    else if (/\/agents\/[^/]+\.md$/.test(path)) checkComponentFrontmatter(path);
    if (path.endsWith("evals.json")) checkEvals(path);
    checkTextContent(path);
  }
}

if (failures.length > 0) {
  console.error(`FAIL — ${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("OK — marketplace and all plugins pass custom validation");
