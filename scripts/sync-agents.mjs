#!/usr/bin/env node
// Emits the marketplace's skills to the cross-tool `.agents/skills/` layout
// (read natively by Codex, Cursor, Gemini CLI, and OpenCode) plus an
// OpenCode-format knowtis-architect agent. Claude Code keeps consuming the
// plugins directly and does not read `.agents/`.
//
//   node scripts/sync-agents.mjs                    # emit to dist/
//   node scripts/sync-agents.mjs --install-repo <path>
//   node scripts/sync-agents.mjs --install-global   # ~/.agents/skills
//   node scripts/sync-agents.mjs --uninstall-global # remove only owned skills
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
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const PLUGINS_DIR = join(ROOT, "plugins");
const ARCHITECT_SRC = join(
  PLUGINS_DIR,
  "domain",
  "agents",
  "knowtis-architect.md",
);
const MANIFEST_NAME = ".knowtis-plugins-manifest.json";
const ARCHITECT_NAME = "knowtis-architect.md";
const SOURCE_REVISION = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: ROOT,
  encoding: "utf8",
}).trim();

function collectSkills() {
  const skills = new Map();
  for (const plugin of readdirSync(PLUGINS_DIR)) {
    const skillsDir = join(PLUGINS_DIR, plugin, "skills");
    if (!existsSync(skillsDir) || !lstatSync(skillsDir).isDirectory()) continue;
    const manifest = JSON.parse(
      readFileSync(
        join(PLUGINS_DIR, plugin, ".claude-plugin", "plugin.json"),
        "utf8",
      ),
    );
    for (const skill of readdirSync(skillsDir)) {
      const src = join(skillsDir, skill);
      if (!lstatSync(src).isDirectory()) continue;
      if (!existsSync(join(src, "SKILL.md"))) {
        console.error(`✗ ${relative(ROOT, src)} is missing SKILL.md`);
        process.exit(1);
      }
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
  const text = readFileSync(ARCHITECT_SRC, "utf8");
  const end = text.indexOf("\n---", 4);
  const frontmatter = text.slice(4, end);
  const body = text.slice(end + 4).trimStart();

  const descLines = [];
  let inDesc = false;
  for (const line of frontmatter.split("\n")) {
    if (line.startsWith("description:")) {
      inDesc = true;
      continue;
    }
    if (inDesc) {
      if (!line.startsWith("  ") || line.trim().startsWith("<example>")) break;
      if (line.trim()) descLines.push(line.trim());
    }
  }
  const description = descLines.join(" ");

  return [
    "---",
    `description: ${description}`,
    "mode: subagent",
    "permission:",
    '  "*": deny',
    "  read: allow",
    "  grep: allow",
    "  glob: allow",
    "  list: allow",
    "  skill: allow",
    "---",
    "",
    body,
  ].join("\n");
}

function domainVersion() {
  return JSON.parse(
    readFileSync(
      join(PLUGINS_DIR, "domain", ".claude-plugin", "plugin.json"),
      "utf8",
    ),
  ).version;
}

function agentManifest() {
  return { [ARCHITECT_NAME]: `domain@${domainVersion()}` };
}

function assertAgentInstallable(agentsOut) {
  const agentPath = join(agentsOut, ARCHITECT_NAME);
  const manifestPath = join(agentsOut, MANIFEST_NAME);
  if (!existsSync(agentPath)) return;
  if (existsSync(manifestPath)) {
    const owned = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (ARCHITECT_NAME in owned) return;
  }
  if (readFileSync(agentPath, "utf8") === buildOpencodeAgent()) return;

  console.error(
    `✗ ${relative(homedir(), agentPath)} exists but is not owned by knowtis-plugins — refusing to overwrite`,
  );
  process.exit(1);
}

function installOpencodeAgent(agentsOut) {
  assertAgentInstallable(agentsOut);
  mkdirSync(agentsOut, { recursive: true });
  writeFileSync(join(agentsOut, ARCHITECT_NAME), buildOpencodeAgent());
  writeFileSync(
    join(agentsOut, MANIFEST_NAME),
    JSON.stringify(agentManifest(), null, 2) + "\n",
  );
}

function checkOpencodeAgent(agentsOut) {
  const drift = [];
  const agentPath = join(agentsOut, ARCHITECT_NAME);
  const manifestPath = join(agentsOut, MANIFEST_NAME);
  if (
    !existsSync(agentPath) ||
    readFileSync(agentPath, "utf8") !== buildOpencodeAgent()
  ) {
    drift.push(`.opencode/agents/${ARCHITECT_NAME}: differs from source`);
  }
  const installedManifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : null;
  if (JSON.stringify(installedManifest) !== JSON.stringify(agentManifest())) {
    drift.push(`.opencode/agents/${MANIFEST_NAME}: differs from source`);
  }
  return drift;
}

function portableSkillText(text) {
  return text.replace(/^disable-model-invocation:.*\n/m, "");
}

function copyPortableSkill(src, dest) {
  cpSync(src, dest, { recursive: true });
  const skillPath = join(dest, "SKILL.md");
  writeFileSync(skillPath, portableSkillText(readFileSync(skillPath, "utf8")));
}

function skillIntegrity(dir, portableSource = false) {
  const hash = createHash("sha256");
  for (const file of Array.from(walkFiles(dir)).sort()) {
    const rel = relative(dir, file);
    const content =
      portableSource && rel === "SKILL.md"
        ? Buffer.from(portableSkillText(readFileSync(file, "utf8")))
        : readFileSync(file);
    hash.update(rel);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  return `sha256-${hash.digest("hex")}`;
}

function manifestEntry(src, plugin, version) {
  return {
    source: `${plugin}@${version}`,
    revision: SOURCE_REVISION,
    integrity: skillIntegrity(src, true),
  };
}

function emit(outDir) {
  const skillsOut = join(outDir, ".agents", "skills");
  rmSync(join(outDir, ".agents"), { recursive: true, force: true });
  rmSync(join(outDir, ".opencode"), { recursive: true, force: true });
  mkdirSync(skillsOut, { recursive: true });
  const skills = collectSkills();
  const manifest = {};
  for (const [name, { src, plugin, version }] of skills) {
    rmSync(join(skillsOut, name), { recursive: true, force: true });
    copyPortableSkill(src, join(skillsOut, name));
    manifest[name] = manifestEntry(src, plugin, version);
  }
  writeFileSync(
    join(skillsOut, MANIFEST_NAME),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  const agentsOut = join(outDir, ".opencode", "agents");
  installOpencodeAgent(agentsOut);

  return skills.size;
}

function installSkills(targetSkillsDir) {
  mkdirSync(targetSkillsDir, { recursive: true });
  const manifestPath = join(targetSkillsDir, MANIFEST_NAME);
  const owned = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : {};

  const skills = collectSkills();
  for (const name of skills.keys()) {
    const dest = join(targetSkillsDir, name);
    if (existsSync(dest) && !(name in owned)) {
      console.error(
        `✗ ${relative(homedir(), dest)} exists but was not installed by knowtis-plugins — refusing to overwrite`,
      );
      process.exit(1);
    }
  }

  const manifest = {};
  for (const [name, { src, plugin, version }] of skills) {
    const dest = join(targetSkillsDir, name);
    rmSync(dest, { recursive: true, force: true });
    copyPortableSkill(src, dest);
    manifest[name] = manifestEntry(src, plugin, version);
  }
  for (const stale of Object.keys(owned).filter((n) => !skills.has(n))) {
    rmSync(join(targetSkillsDir, stale), { recursive: true, force: true });
    console.log(`  removed stale skill: ${stale}`);
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return skills.size;
}

function uninstallSkills(targetSkillsDir) {
  const manifestPath = join(targetSkillsDir, MANIFEST_NAME);
  if (!existsSync(manifestPath)) return 0;

  const owned = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const name of Object.keys(owned)) {
    rmSync(join(targetSkillsDir, name), { recursive: true, force: true });
  }
  rmSync(manifestPath, { force: true });
  return Object.keys(owned).length;
}

function* walkFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(path);
    else yield path;
  }
}

function checkSkills(targetSkillsDir) {
  const skills = collectSkills();
  const drift = [];
  const manifestPath = join(targetSkillsDir, MANIFEST_NAME);
  const expectedManifest = Object.fromEntries(
    Array.from(skills, ([name, { src, plugin, version }]) => [
      name,
      manifestEntry(src, plugin, version),
    ]),
  );
  const installedManifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : null;

  if (JSON.stringify(installedManifest) !== JSON.stringify(expectedManifest)) {
    drift.push(`${MANIFEST_NAME}: differs from source`);
  }

  for (const [name, { src }] of skills) {
    const dest = join(targetSkillsDir, name);
    if (!existsSync(dest)) {
      drift.push(`${name}: not installed`);
      continue;
    }

    const sourceFiles = new Map(
      Array.from(walkFiles(src), (file) => [relative(src, file), file]),
    );
    const installedFiles = new Map(
      Array.from(walkFiles(dest), (file) => [relative(dest, file), file]),
    );
    for (const [rel, file] of sourceFiles) {
      const installed = join(dest, rel);
      const expected =
        rel === "SKILL.md"
          ? Buffer.from(portableSkillText(readFileSync(file, "utf8")))
          : readFileSync(file);
      if (!existsSync(installed) || !readFileSync(installed).equals(expected)) {
        drift.push(`${name}/${rel}: differs from source`);
      }
    }
    for (const rel of installedFiles.keys()) {
      if (!sourceFiles.has(rel)) drift.push(`${name}/${rel}: unexpected file`);
    }
  }
  if (drift.length > 0) {
    return { drift, count: skills.size };
  }
  return { drift: [], count: skills.size };
}

const [mode, arg] = process.argv.slice(2);

if (mode === "--install-repo") {
  if (!arg || !existsSync(arg)) {
    console.error("usage: sync-agents.mjs --install-repo <repo-path>");
    process.exit(1);
  }
  const agentsOut = join(arg, ".opencode", "agents");
  assertAgentInstallable(agentsOut);
  const count = installSkills(join(arg, ".agents", "skills"));
  installOpencodeAgent(agentsOut);
  console.log(
    `OK — ${count} skills → ${arg}/.agents/skills, architect agent → ${arg}/.opencode/agents`,
  );
} else if (mode === "--install-global") {
  const count = installSkills(join(homedir(), ".agents", "skills"));
  console.log(
    `OK — ${count} skills → ~/.agents/skills (read by Codex, Cursor, Gemini, OpenCode)`,
  );
} else if (mode === "--uninstall-global") {
  const count = uninstallSkills(join(homedir(), ".agents", "skills"));
  console.log(
    `OK — removed ${count} knowtis-plugins skills from ~/.agents/skills`,
  );
} else if (mode === "--check") {
  if (!arg) {
    console.error("usage: sync-agents.mjs --check <repo-path|skills-dir>");
    process.exit(1);
  }
  const isRepo = existsSync(join(arg, ".agents", "skills"));
  const dir = isRepo ? join(arg, ".agents", "skills") : arg;
  const result = checkSkills(dir);
  const drift = result.drift;
  if (isRepo)
    drift.push(...checkOpencodeAgent(join(arg, ".opencode", "agents")));
  if (drift.length > 0) {
    console.error(`DRIFT — ${drift.length} difference(s):`);
    for (const item of drift) console.error(`  ✗ ${item}`);
    process.exit(1);
  }
  console.log(
    `OK — ${result.count} skills${isRepo ? " and OpenCode agent" : ""} in sync at ${arg}`,
  );
} else if (mode === undefined) {
  const count = emit(join(ROOT, "dist"));
  console.log(
    `OK — ${count} skills → dist/.agents/skills, architect agent → dist/.opencode/agents`,
  );
} else {
  console.error(
    "usage: sync-agents.mjs [--install-repo <path> | --install-global | --uninstall-global | --check <path>]",
  );
  process.exit(1);
}
