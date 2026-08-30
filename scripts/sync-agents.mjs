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
//   node scripts/sync-agents.mjs --output <path>    # replace generated trees there

import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  renameSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
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
const AGENT_LICENSE_NAME = "knowtis-plugins-LICENSE";
const AGENT_TRANSACTION_NAME = ".knowtis-agent-transaction.json";
const SKILL_TRANSACTION_NAME = ".knowtis-skills-transaction.json";
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LEGACY_AGENT_INTEGRITIES = new Set([
  "sha256-ee77a45dd61faa8026e9def002ca73203608c073769eb01726134292d6d6b67b",
  "sha256-6540a83a386739bc8d06cf82ee42bf8cedb133b5e05c645a11f794004131055a",
]);
const SOURCE_COMMIT = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: ROOT,
  encoding: "utf8",
}).trim();
const SOURCE_DIRTY = execFileSync(
  "git",
  [
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--ignored",
    "--",
    "plugins",
    "LICENSE",
    "scripts/sync-agents.mjs",
  ],
  { cwd: ROOT, encoding: "utf8" },
).trim();
const SOURCE_REVISION = `${SOURCE_COMMIT}${SOURCE_DIRTY ? "-dirty" : ""}`;

function lstatOrNull(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function assertSafeInstallRoot(path) {
  for (const candidate of [dirname(path), path]) {
    if (lstatOrNull(candidate)?.isSymbolicLink()) {
      console.error(`✗ ${candidate} is a symlink — refusing to install through it`);
      process.exit(1);
    }
  }
}

function assertSafeEmissionRoot(outDir) {
  for (const candidate of [
    outDir,
    join(outDir, ".agents"),
    join(outDir, ".opencode"),
  ]) {
    if (lstatOrNull(candidate)?.isSymbolicLink()) {
      console.error(`✗ ${candidate} is a symlink — refusing to replace it`);
      process.exit(1);
    }
  }
}

function writeTransaction(path, transaction) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(transaction, null, 2) + "\n", {
    flag: "wx",
  });
  renameSync(temporary, path);
}

function readTransaction(path, stagePattern) {
  const stats = lstatOrNull(path);
  if (!stats) return null;
  if (stats.isSymbolicLink()) {
    console.error(`✗ ${path}: transaction journal must not be a symlink`);
    process.exit(1);
  }
  let transaction;
  try {
    transaction = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`✗ ${path}: invalid transaction journal (${error.message})`);
    process.exit(1);
  }
  if (
    transaction?.version !== 1 ||
    typeof transaction.committed !== "boolean" ||
    !stagePattern.test(transaction.stage ?? "")
  ) {
    console.error(`✗ ${path}: invalid transaction journal schema`);
    process.exit(1);
  }
  return transaction;
}

function readSourceFile(path) {
  const stats = lstatSync(path);
  if (stats.isSymbolicLink()) {
    console.error(`✗ ${relative(ROOT, path)} is a symlink — refusing to follow it`);
    process.exit(1);
  }
  if (!stats.isFile()) {
    console.error(`✗ ${relative(ROOT, path)} is not a regular file`);
    process.exit(1);
  }
  return readFileSync(path);
}

function collectSkills() {
  const skills = new Map();
  for (const plugin of readdirSync(PLUGINS_DIR)) {
    const pluginDir = join(PLUGINS_DIR, plugin);
    const pluginStats = lstatSync(pluginDir);
    if (pluginStats.isSymbolicLink()) {
      console.error(`✗ ${relative(ROOT, pluginDir)} is a symlink — refusing to follow it`);
      process.exit(1);
    }
    if (!pluginStats.isDirectory()) continue;
    const skillsDir = join(pluginDir, "skills");
    const skillsStats = lstatOrNull(skillsDir);
    if (!skillsStats) continue;
    if (skillsStats.isSymbolicLink()) {
      console.error(`✗ ${relative(ROOT, skillsDir)} is a symlink — refusing to follow it`);
      process.exit(1);
    }
    if (!skillsStats.isDirectory()) continue;
    const manifest = JSON.parse(
      readSourceFile(join(pluginDir, ".claude-plugin", "plugin.json")).toString(),
    );
    for (const skill of readdirSync(skillsDir)) {
      const src = join(skillsDir, skill);
      const stats = lstatSync(src);
      if (stats.isSymbolicLink()) {
        console.error(`✗ ${relative(ROOT, src)} is a symlink — refusing to follow it`);
        process.exit(1);
      }
      if (!stats.isDirectory()) continue;
      if (!SKILL_NAME_PATTERN.test(skill)) {
        console.error(`✗ invalid skill directory name: ${skill}`);
        process.exit(1);
      }
      if (!existsSync(join(src, "SKILL.md"))) {
        console.error(`✗ ${relative(ROOT, src)} is missing SKILL.md`);
        process.exit(1);
      }
      for (const file of walkFiles(src)) void file;
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
  const text = readSourceFile(ARCHITECT_SRC)
    .toString()
    .replaceAll("\r\n", "\n");
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
    readSourceFile(
      join(PLUGINS_DIR, "domain", ".claude-plugin", "plugin.json"),
    ).toString(),
  ).version;
}

function contentIntegrity(content) {
  return `sha256-${createHash("sha256").update(content).digest("hex")}`;
}

function portablePath(path) {
  return path.split(sep).join("/");
}

function portableContent(path, content) {
  if (!path.endsWith("LICENSE") && !/\.(?:json|md|txt|ya?ml)$/i.test(path)) {
    return content;
  }
  return Buffer.from(content.toString().replaceAll("\r\n", "\n"));
}

function agentManifest() {
  const source = `domain@${domainVersion()}`;
  return {
    [ARCHITECT_NAME]: {
      source,
      revision: SOURCE_REVISION,
      integrity: contentIntegrity(
        portableContent(ARCHITECT_NAME, Buffer.from(buildOpencodeAgent())),
      ),
    },
    [AGENT_LICENSE_NAME]: {
      source,
      revision: SOURCE_REVISION,
      integrity: contentIntegrity(
        portableContent(
          AGENT_LICENSE_NAME,
          readSourceFile(join(ROOT, "LICENSE")),
        ),
      ),
    },
  };
}

function readAgentOwnership(agentsOut) {
  const manifestPath = join(agentsOut, MANIFEST_NAME);
  const stats = lstatOrNull(manifestPath);
  if (!stats) return false;
  if (stats.isSymbolicLink()) {
    console.error(`✗ ${manifestPath}: ownership manifest must not be a symlink`);
    process.exit(1);
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    console.error(`✗ ${manifestPath}: invalid ownership manifest (${error.message})`);
    process.exit(1);
  }
  const entry = manifest?.[ARCHITECT_NAME];
  if (typeof entry === "string" && /^domain@\d+\.\d+\.\d+$/.test(entry)) {
    const agentPath = join(agentsOut, ARCHITECT_NAME);
    const agentStats = lstatOrNull(agentPath);
    if (
      !agentStats ||
      agentStats.isSymbolicLink() ||
      !LEGACY_AGENT_INTEGRITIES.has(
        contentIntegrity(
          readFileSync(agentPath, "utf8").replaceAll("\r\n", "\n"),
        ),
      )
    ) {
      console.error(
        `✗ ${relative(homedir(), agentPath)} does not match a known legacy installation — refusing to overwrite`,
      );
      process.exit(1);
    }
    return "legacy";
  }
  for (const name of [ARCHITECT_NAME, AGENT_LICENSE_NAME]) {
    const ownedEntry = manifest?.[name];
    if (
      !ownedEntry ||
      typeof ownedEntry !== "object" ||
      Array.isArray(ownedEntry) ||
      !/^domain@\d+\.\d+\.\d+$/.test(ownedEntry.source ?? "") ||
      !/^[a-f0-9]{40}(?:-dirty)?$/.test(ownedEntry.revision ?? "") ||
      !/^sha256-[a-f0-9]{64}$/.test(ownedEntry.integrity ?? "")
    ) {
      console.error(`✗ ${manifestPath}: invalid ownership entry for ${name}`);
      process.exit(1);
    }
    const path = join(agentsOut, name);
    const pathStats = lstatOrNull(path);
    if (pathStats?.isSymbolicLink()) {
      console.error(`✗ ${path} is a symlink — refusing to follow it`);
      process.exit(1);
    }
    if (
      pathStats &&
      contentIntegrity(portableContent(name, readFileSync(path))) !==
        ownedEntry.integrity
    ) {
      console.error(
        `✗ ${relative(homedir(), path)} was modified after installation — refusing to overwrite`,
      );
      process.exit(1);
    }
  }
  return "modern";
}

function recoverAgentTransaction(agentsOut) {
  const transactionPath = join(agentsOut, AGENT_TRANSACTION_NAME);
  const transaction = readTransaction(
    transactionPath,
    /^\.knowtis-agent-stage-[A-Za-z0-9]+$/,
  );
  if (!transaction) return;
  if (
    typeof transaction.hadAgent !== "boolean" ||
    typeof transaction.hadManifest !== "boolean" ||
    typeof transaction.hadLicense !== "boolean"
  ) {
    console.error(`✗ ${transactionPath}: invalid agent transaction journal`);
    process.exit(1);
  }
  const stage = join(agentsOut, transaction.stage);
  const stageStats = lstatOrNull(stage);
  if (transaction.committed && !stageStats) {
    rmSync(transactionPath, { force: true });
    return;
  }
  if (!stageStats || stageStats.isSymbolicLink() || !stageStats.isDirectory()) {
    console.error(`✗ ${transactionPath}: agent transaction stage is unavailable`);
    process.exit(1);
  }
  if (!transaction.committed) {
    for (const [destination, backup, hadDestination] of [
      [
        join(agentsOut, MANIFEST_NAME),
        join(stage, "manifest.backup"),
        transaction.hadManifest,
      ],
      [
        join(agentsOut, ARCHITECT_NAME),
        join(stage, "agent.backup"),
        transaction.hadAgent,
      ],
      [
        join(agentsOut, AGENT_LICENSE_NAME),
        join(stage, "license.backup"),
        transaction.hadLicense,
      ],
    ]) {
      if (lstatOrNull(backup)) {
        rmSync(destination, { recursive: true, force: true });
        renameSync(backup, destination);
      } else if (!hadDestination) {
        rmSync(destination, { recursive: true, force: true });
      }
    }
  }
  rmSync(stage, { recursive: true, force: true });
  rmSync(transactionPath, { force: true });
}

function assertAgentInstallable(agentsOut) {
  assertSafeInstallRoot(agentsOut);
  recoverAgentTransaction(agentsOut);
  const agentPath = join(agentsOut, ARCHITECT_NAME);
  const owned = readAgentOwnership(agentsOut);
  const stats = lstatOrNull(agentPath);
  const licensePath = join(agentsOut, AGENT_LICENSE_NAME);
  const licenseStats = lstatOrNull(licensePath);
  if (licenseStats?.isSymbolicLink()) {
    console.error(`✗ ${licensePath} is a symlink — refusing to follow it`);
    process.exit(1);
  }
  if (licenseStats && owned !== "modern") {
    console.error(`✗ ${licensePath} exists but is not owned by knowtis-plugins`);
    process.exit(1);
  }
  if (!stats) return;
  if (stats.isSymbolicLink()) {
    console.error(`✗ ${agentPath} is a symlink — refusing to follow it`);
    process.exit(1);
  }
  if (readFileSync(agentPath, "utf8") === buildOpencodeAgent()) return;
  if (owned) return;

  console.error(
    `✗ ${relative(homedir(), agentPath)} exists but is not owned by knowtis-plugins — refusing to overwrite`,
  );
  process.exit(1);
}

function installOpencodeAgent(agentsOut) {
  assertAgentInstallable(agentsOut);
  mkdirSync(agentsOut, { recursive: true });
  const stage = mkdtempSync(join(agentsOut, ".knowtis-agent-stage-"));
  const pendingAgent = join(stage, ARCHITECT_NAME);
  const pendingManifest = join(stage, MANIFEST_NAME);
  const pendingLicense = join(stage, AGENT_LICENSE_NAME);
  const agentPath = join(agentsOut, ARCHITECT_NAME);
  const licensePath = join(agentsOut, AGENT_LICENSE_NAME);
  const manifestPath = join(agentsOut, MANIFEST_NAME);
  const agentBackup = join(stage, "agent.backup");
  const manifestBackup = join(stage, "manifest.backup");
  const licenseBackup = join(stage, "license.backup");
  const hadAgent = Boolean(lstatOrNull(agentPath));
  const hadLicense = Boolean(lstatOrNull(licensePath));
  const hadManifest = Boolean(lstatOrNull(manifestPath));
  const transactionPath = join(agentsOut, AGENT_TRANSACTION_NAME);
  const transaction = {
    version: 1,
    stage: basename(stage),
    hadAgent,
    hadLicense,
    hadManifest,
    committed: false,
  };

  writeTransaction(transactionPath, transaction);
  try {
    writeFileSync(pendingAgent, buildOpencodeAgent(), { flag: "wx" });
    writeFileSync(pendingLicense, readSourceFile(join(ROOT, "LICENSE")), {
      flag: "wx",
    });
    writeFileSync(
      pendingManifest,
      JSON.stringify(agentManifest(), null, 2) + "\n",
      { flag: "wx" },
    );
    if (hadAgent) renameSync(agentPath, agentBackup);
    renameSync(pendingAgent, agentPath);
    if (hadLicense) renameSync(licensePath, licenseBackup);
    renameSync(pendingLicense, licensePath);
    if (hadManifest) renameSync(manifestPath, manifestBackup);
    renameSync(pendingManifest, manifestPath);
    transaction.committed = true;
    writeTransaction(transactionPath, transaction);
  } catch (error) {
    recoverAgentTransaction(agentsOut);
    throw error;
  }
  rmSync(stage, { recursive: true, force: true });
  rmSync(transactionPath, { force: true });
}

function checkOpencodeAgent(agentsOut) {
  assertSafeInstallRoot(agentsOut);
  const drift = [];
  const agentPath = join(agentsOut, ARCHITECT_NAME);
  const manifestPath = join(agentsOut, MANIFEST_NAME);
  const licensePath = join(agentsOut, AGENT_LICENSE_NAME);
  for (const path of [agentPath, manifestPath, licensePath]) {
    if (lstatOrNull(path)?.isSymbolicLink()) {
      console.error(`✗ ${path} is a symlink — refusing to follow it`);
      process.exit(1);
    }
  }
  if (
    !existsSync(agentPath) ||
    portableContent(ARCHITECT_NAME, readFileSync(agentPath)).toString() !==
      buildOpencodeAgent()
  ) {
    drift.push(`.opencode/agents/${ARCHITECT_NAME}: differs from source`);
  }
  if (
    !existsSync(licensePath) ||
    !portableContent(AGENT_LICENSE_NAME, readFileSync(licensePath)).equals(
      portableContent(
        AGENT_LICENSE_NAME,
        readSourceFile(join(ROOT, "LICENSE")),
      ),
    )
  ) {
    drift.push(`.opencode/agents/${AGENT_LICENSE_NAME}: differs from source`);
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
  writeFileSync(join(dest, "LICENSE"), readSourceFile(join(ROOT, "LICENSE")));
}

function portableFiles(dir) {
  const files = new Map(
    Array.from(walkFiles(dir), (file) => {
      const path = portablePath(relative(dir, file));
      return [path, portableContent(path, readFileSync(file))];
    }),
  );
  files.set("SKILL.md", Buffer.from(portableSkillText(files.get("SKILL.md").toString())));
  files.set("LICENSE", readSourceFile(join(ROOT, "LICENSE")));
  return files;
}

function skillIntegrity(dir, portableSource = false) {
  const stats = lstatSync(dir);
  if (stats.isSymbolicLink()) {
    console.error(`✗ ${dir} is a symlink — refusing to follow it`);
    process.exit(1);
  }
  if (!stats.isDirectory()) {
    console.error(`✗ ${dir} is not a directory`);
    process.exit(1);
  }
  const hash = createHash("sha256");
  const files = portableSource
    ? portableFiles(dir)
    : new Map(
        Array.from(walkFiles(dir), (file) => {
          const path = portablePath(relative(dir, file));
          return [path, portableContent(path, readFileSync(file))];
        }),
      );
  for (const [rel, content] of Array.from(files).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  )) {
    hash.update(rel);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  return `sha256-${hash.digest("hex")}`;
}

function legacyWindowsSkillIntegrity(dir, crlf) {
  const files = Array.from(walkFiles(dir), (file) => {
    const path = portablePath(relative(dir, file)).replaceAll("/", "\\");
    let content = readFileSync(file);
    if (path.endsWith("LICENSE") || /\.(?:json|md|txt|ya?ml)$/i.test(path)) {
      const normalized = content.toString().replaceAll("\r\n", "\n");
      content = Buffer.from(crlf ? normalized.replaceAll("\n", "\r\n") : normalized);
    }
    return [path, content];
  }).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const hash = createHash("sha256");
  for (const [path, content] of files) {
    hash.update(path);
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

function skillTarget(targetSkillsDir, name, manifestPath) {
  if (!SKILL_NAME_PATTERN.test(name)) {
    console.error(`✗ ${manifestPath}: invalid owned skill name "${name}"`);
    process.exit(1);
  }
  const root = resolve(targetSkillsDir);
  const target = resolve(root, name);
  if (!target.startsWith(`${root}${sep}`)) {
    console.error(`✗ ${manifestPath}: owned skill escapes the skills directory`);
    process.exit(1);
  }
  return target;
}

function readOwnership(targetSkillsDir) {
  const manifestPath = join(targetSkillsDir, MANIFEST_NAME);
  const manifestStats = lstatOrNull(manifestPath);
  if (!manifestStats) return {};
  if (manifestStats.isSymbolicLink()) {
    console.error(`✗ ${manifestPath}: ownership manifest must not be a symlink`);
    process.exit(1);
  }

  let owned;
  try {
    owned = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    console.error(`✗ ${manifestPath}: invalid ownership manifest (${error.message})`);
    process.exit(1);
  }
  if (!owned || typeof owned !== "object" || Array.isArray(owned)) {
    console.error(`✗ ${manifestPath}: ownership manifest must be an object`);
    process.exit(1);
  }

  for (const [name, entry] of Object.entries(owned)) {
    const dest = skillTarget(targetSkillsDir, name, manifestPath);
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      !/^[a-z0-9-]+@\d+\.\d+\.\d+$/.test(entry.source ?? "") ||
      !/^[a-f0-9]{40}(?:-dirty)?$/.test(entry.revision ?? "") ||
      !/^sha256-[a-f0-9]{64}$/.test(entry.integrity ?? "")
    ) {
      console.error(`✗ ${manifestPath}: invalid ownership entry for "${name}"`);
      process.exit(1);
    }
    if (
      lstatOrNull(dest) &&
      skillIntegrity(dest) !== entry.integrity &&
      legacyWindowsSkillIntegrity(dest, false) !== entry.integrity &&
      legacyWindowsSkillIntegrity(dest, true) !== entry.integrity
    ) {
      console.error(
        `✗ ${relative(homedir(), dest)} was modified after installation — refusing to overwrite`,
      );
      process.exit(1);
    }
  }
  return owned;
}

function recoverSkillTransaction(targetSkillsDir) {
  const transactionPath = join(targetSkillsDir, SKILL_TRANSACTION_NAME);
  const transaction = readTransaction(
    transactionPath,
    /^\.knowtis-plugins-stage-[A-Za-z0-9]+$/,
  );
  if (!transaction) return;
  if (
    typeof transaction.hadManifest !== "boolean" ||
    !Array.isArray(transaction.swaps) ||
    transaction.swaps.some(
      (swap) =>
        !SKILL_NAME_PATTERN.test(swap?.name ?? "") ||
        typeof swap.hadDestination !== "boolean",
    )
  ) {
    console.error(`✗ ${transactionPath}: invalid skill transaction journal`);
    process.exit(1);
  }
  const stage = join(targetSkillsDir, transaction.stage);
  const stageStats = lstatOrNull(stage);
  if (transaction.committed && !stageStats) {
    rmSync(transactionPath, { force: true });
    return;
  }
  if (!stageStats || stageStats.isSymbolicLink() || !stageStats.isDirectory()) {
    console.error(`✗ ${transactionPath}: skill transaction stage is unavailable`);
    process.exit(1);
  }
  if (!transaction.committed) {
    const manifestPath = join(targetSkillsDir, MANIFEST_NAME);
    const manifestBackup = join(stage, "manifest.backup");
    if (lstatOrNull(manifestBackup)) {
      rmSync(manifestPath, { force: true });
      renameSync(manifestBackup, manifestPath);
    } else if (!transaction.hadManifest) {
      rmSync(manifestPath, { force: true });
    }
    for (const { name, hadDestination } of [...transaction.swaps].reverse()) {
      const destination = skillTarget(targetSkillsDir, name, manifestPath);
      const backup = join(stage, "backup", name);
      if (lstatOrNull(backup)) {
        rmSync(destination, { recursive: true, force: true });
        renameSync(backup, destination);
      } else if (!hadDestination) {
        rmSync(destination, { recursive: true, force: true });
      }
    }
  }
  rmSync(stage, { recursive: true, force: true });
  rmSync(transactionPath, { force: true });
}

function emit(outDir) {
  assertSafeEmissionRoot(outDir);
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
  assertSafeInstallRoot(targetSkillsDir);
  mkdirSync(targetSkillsDir, { recursive: true });
  recoverSkillTransaction(targetSkillsDir);
  const manifestPath = join(targetSkillsDir, MANIFEST_NAME);
  const owned = readOwnership(targetSkillsDir);

  const skills = collectSkills();
  for (const name of skills.keys()) {
    const dest = skillTarget(targetSkillsDir, name, manifestPath);
    if (lstatOrNull(dest) && !Object.hasOwn(owned, name)) {
      console.error(
        `✗ ${relative(homedir(), dest)} exists but was not installed by knowtis-plugins — refusing to overwrite`,
      );
      process.exit(1);
    }
  }

  const stage = mkdtempSync(join(targetSkillsDir, ".knowtis-plugins-stage-"));
  const fresh = join(stage, "new");
  const backup = join(stage, "backup");
  mkdirSync(fresh);
  mkdirSync(backup);
  const manifest = {};
  const hadManifest = Boolean(lstatOrNull(manifestPath));
  const transactionPath = join(targetSkillsDir, SKILL_TRANSACTION_NAME);
  const transaction = {
    version: 1,
    stage: basename(stage),
    hadManifest,
    swaps: [],
    committed: false,
  };

  writeTransaction(transactionPath, transaction);
  try {
    for (const [name, { src, plugin, version }] of skills) {
      const staged = join(fresh, name);
      copyPortableSkill(src, staged);
      manifest[name] = manifestEntry(src, plugin, version);
      if (skillIntegrity(staged) !== manifest[name].integrity) {
        throw new Error(`${name}: staged content failed integrity verification`);
      }
    }

    for (const name of new Set([...Object.keys(owned), ...skills.keys()])) {
      const dest = skillTarget(targetSkillsDir, name, manifestPath);
      const previous = join(backup, name);
      const hadDestination = Boolean(lstatOrNull(dest));
      transaction.swaps.push({ name, hadDestination });
      writeTransaction(transactionPath, transaction);
      if (hadDestination) renameSync(dest, previous);
      const staged = join(fresh, name);
      if (lstatOrNull(staged)) renameSync(staged, dest);
    }

    const manifestBackup = join(stage, "manifest.backup");
    if (hadManifest) {
      renameSync(manifestPath, manifestBackup);
    }
    const pendingManifest = join(stage, "manifest.pending");
    writeFileSync(pendingManifest, JSON.stringify(manifest, null, 2) + "\n", {
      flag: "wx",
    });
    renameSync(pendingManifest, manifestPath);
    transaction.committed = true;
    writeTransaction(transactionPath, transaction);
  } catch (error) {
    recoverSkillTransaction(targetSkillsDir);
    throw error;
  }

  rmSync(stage, { recursive: true, force: true });
  rmSync(transactionPath, { force: true });
  for (const stale of Object.keys(owned).filter((name) => !skills.has(name))) {
    console.log(`  removed stale skill: ${stale}`);
  }
  return skills.size;
}

function uninstallSkills(targetSkillsDir) {
  assertSafeInstallRoot(targetSkillsDir);
  recoverSkillTransaction(targetSkillsDir);
  const manifestPath = join(targetSkillsDir, MANIFEST_NAME);
  if (!lstatOrNull(manifestPath)) return 0;

  const owned = readOwnership(targetSkillsDir);
  for (const name of Object.keys(owned)) {
    rmSync(skillTarget(targetSkillsDir, name, manifestPath), {
      recursive: true,
      force: true,
    });
  }
  rmSync(manifestPath, { force: true });
  return Object.keys(owned).length;
}

function* walkFiles(dir) {
  const stats = lstatSync(dir);
  if (stats.isSymbolicLink()) {
    console.error(`✗ ${dir} is a symlink — refusing to follow it`);
    process.exit(1);
  }
  if (!stats.isDirectory()) {
    console.error(`✗ ${dir} is not a directory`);
    process.exit(1);
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (lstatSync(path).isSymbolicLink()) {
      console.error(`✗ ${path} is a symlink — refusing to follow it`);
      process.exit(1);
    }
    if (entry.isDirectory()) yield* walkFiles(path);
    else yield path;
  }
}

function checkSkills(targetSkillsDir) {
  assertSafeInstallRoot(targetSkillsDir);
  const skills = collectSkills();
  const drift = [];
  const manifestPath = join(targetSkillsDir, MANIFEST_NAME);
  if (lstatOrNull(manifestPath)?.isSymbolicLink()) {
    console.error(`✗ ${manifestPath}: ownership manifest must not be a symlink`);
    process.exit(1);
  }
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

    const sourceFiles = portableFiles(src);
    const installedFiles = new Map(
      Array.from(walkFiles(dest), (file) => [
        portablePath(relative(dest, file)),
        file,
      ]),
    );
    for (const [rel, expected] of sourceFiles) {
      const installed = join(dest, rel);
      if (
        !existsSync(installed) ||
        !portableContent(rel, readFileSync(installed)).equals(expected)
      ) {
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
} else if (mode === "--output") {
  if (!arg) {
    console.error("usage: sync-agents.mjs --output <path>");
    process.exit(1);
  }
  const count = emit(resolve(arg));
  console.log(`OK — ${count} skills and architect agent emitted at ${arg}`);
} else if (mode === undefined) {
  const count = emit(join(ROOT, "dist"));
  console.log(
    `OK — ${count} skills → dist/.agents/skills, architect agent → dist/.opencode/agents`,
  );
} else {
  console.error(
    "usage: sync-agents.mjs [--install-repo <path> | --install-global | --uninstall-global | --check <path> | --output <path>]",
  );
  process.exit(1);
}
