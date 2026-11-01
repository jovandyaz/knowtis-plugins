import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "scripts", "sync-agents.mjs");

function tempRepo(t) {
  const dir = mkdtempSync(join(tmpdir(), "knowtis-skills-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function run(...args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function runWithEnv(env, ...args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function* walkFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(path);
    else yield path;
  }
}

function legacyWindowsIntegrity(dir, crlf) {
  const files = Array.from(walkFiles(dir), (file) => {
    const path = file.slice(dir.length + 1).replaceAll("/", "\\");
    let content = readFileSync(file);
    if (path.endsWith("LICENSE") || /\.(?:json|md|txt|ya?ml)$/i.test(path)) {
      const normalized = content.toString().replaceAll("\r\n", "\n");
      content = Buffer.from(crlf ? normalized.replaceAll("\n", "\r\n") : normalized);
    }
    return [path, content];
  }).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const hash = createHash("sha256");
  for (const [path, content] of files) {
    hash.update(path).update("\0").update(content).update("\0");
  }
  return `sha256-${hash.digest("hex")}`;
}

test("installs portable skills and detects content drift", (t) => {
  const repo = tempRepo(t);
  assert.equal(run("--install-repo", repo).status, 0);
  assert.equal(run("--check", repo).status, 0);

  const manifest = JSON.parse(
    readFileSync(
      join(repo, ".agents", "skills", ".knowtis-plugins-manifest.json"),
      "utf8",
    ),
  );
  assert.deepEqual(Object.keys(manifest).sort(), [
    "building-copilot-features",
    "investigating-postgres",
    "managing-drizzle-migrations",
  ]);
  assert.match(manifest["investigating-postgres"].integrity, /^sha256-[a-f0-9]{64}$/);
  assert.match(manifest["investigating-postgres"].revision, /^[a-f0-9]{40}(?:-dirty)?$/);
  assert.match(
    readFileSync(join(repo, ".agents", "skills", "investigating-postgres", "LICENSE"), "utf8"),
    /MIT License/,
  );
  assert.equal(existsSync(join(repo, ".opencode")), false);

  const skillPath = join(repo, ".agents", "skills", "investigating-postgres", "SKILL.md");
  writeFileSync(
    skillPath,
    readFileSync(skillPath, "utf8").replaceAll("\n", "\r\n"),
  );
  assert.equal(run("--check", repo).status, 0);

  appendFileSync(
    join(repo, ".agents", "skills", "investigating-postgres", "SKILL.md"),
    "\nlocal drift\n",
  );
  const check = run("--check", repo);
  assert.equal(check.status, 1);
  assert.match(check.stderr, /investigating-postgres\/SKILL\.md: differs from source/);
});

test("refuses to overwrite an unrelated skill before installing anything", (t) => {
  const repo = tempRepo(t);
  const skill = join(repo, ".agents", "skills", "investigating-postgres");
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, "SKILL.md"), "unrelated\n");

  const install = run("--install-repo", repo);
  assert.equal(install.status, 1);
  assert.match(install.stderr, /was not installed by knowtis-plugins/);
  assert.equal(readFileSync(join(skill, "SKILL.md"), "utf8"), "unrelated\n");
  assert.equal(
    existsSync(
      join(repo, ".agents", "skills", ".knowtis-plugins-manifest.json"),
    ),
    false,
  );
});

test("rejects unsafe manifest keys without deleting outside the skills directory", (t) => {
  const repo = tempRepo(t);
  const skills = join(repo, ".agents", "skills");
  const victim = join(repo, "victim");
  mkdirSync(skills, { recursive: true });
  mkdirSync(victim);
  writeFileSync(join(victim, "sentinel"), "keep\n");
  writeFileSync(
    join(skills, ".knowtis-plugins-manifest.json"),
    JSON.stringify({
      "../../../victim": {
        source: "domain@0.2.0",
        revision: "a".repeat(40),
        integrity: `sha256-${"b".repeat(64)}`,
      },
    }),
  );

  const install = run("--install-repo", repo);
  assert.equal(install.status, 1);
  assert.match(install.stderr, /invalid owned skill name/);
  assert.equal(readFileSync(join(victim, "sentinel"), "utf8"), "keep\n");
});

test("refuses to overwrite a locally modified owned skill", (t) => {
  const repo = tempRepo(t);
  assert.equal(run("--install-repo", repo).status, 0);
  const skill = join(repo, ".agents", "skills", "investigating-postgres", "SKILL.md");
  appendFileSync(skill, "\nlocal change\n");

  const install = run("--install-repo", repo);
  assert.equal(install.status, 1);
  assert.match(install.stderr, /modified after installation/);
  assert.match(readFileSync(skill, "utf8"), /local change/);
});

test("migrates a pre-canonical Windows skill manifest", (t) => {
  const repo = tempRepo(t);
  assert.equal(run("--install-repo", repo).status, 0);
  const skills = join(repo, ".agents", "skills");
  const skillDir = join(skills, "investigating-postgres");
  rmSync(join(skillDir, "LICENSE"));
  for (const file of walkFiles(skillDir)) {
    if (/\.(?:json|md|txt|ya?ml)$/i.test(file)) {
      writeFileSync(
        file,
        readFileSync(file, "utf8")
          .replaceAll("\r\n", "\n")
          .replaceAll("\n", "\r\n"),
      );
    }
  }
  const manifestPath = join(skills, ".knowtis-plugins-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest["investigating-postgres"].integrity = legacyWindowsIntegrity(skillDir, true);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  const install = run("--install-repo", repo);
  assert.equal(install.status, 0, install.stderr);
  assert.equal(run("--check", repo).status, 0);
  assert.match(readFileSync(join(skillDir, "LICENSE"), "utf8"), /MIT License/);

  rmSync(join(skillDir, "LICENSE"));
  const migratedManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  migratedManifest["investigating-postgres"].integrity = legacyWindowsIntegrity(skillDir, false);
  writeFileSync(manifestPath, JSON.stringify(migratedManifest, null, 2) + "\n");
  assert.equal(run("--install-repo", repo).status, 0);
  assert.equal(run("--check", repo).status, 0);
});

test("rejects malformed and symlinked ownership manifests", (t) => {
  const malformedRepo = tempRepo(t);
  const malformedSkills = join(malformedRepo, ".agents", "skills");
  mkdirSync(malformedSkills, { recursive: true });
  writeFileSync(join(malformedSkills, ".knowtis-plugins-manifest.json"), "{");
  assert.match(
    run("--install-repo", malformedRepo).stderr,
    /invalid ownership manifest/,
  );

  const linkedRepo = tempRepo(t);
  const linkedSkills = join(linkedRepo, ".agents", "skills");
  const external = join(linkedRepo, "manifest.json");
  mkdirSync(linkedSkills, { recursive: true });
  writeFileSync(external, "{}\n");
  symlinkSync(external, join(linkedSkills, ".knowtis-plugins-manifest.json"));
  const install = run("--install-repo", linkedRepo);
  assert.equal(install.status, 1);
  assert.match(install.stderr, /ownership manifest must not be a symlink/);
});

test("rejects symlinked installation roots before writing outside the repository", (t) => {
  const repo = tempRepo(t);
  const external = tempRepo(t);
  symlinkSync(external, join(repo, ".agents"));

  const install = run("--install-repo", repo);
  assert.equal(install.status, 1);
  assert.match(install.stderr, /refusing to install through it/);
  assert.equal(existsSync(join(external, "skills")), false);
});

test("rejects source symlinks before copying portable skills", (t) => {
  const repo = tempRepo(t);
  const external = join(repo, "external.txt");
  const link = join(
    root,
    "plugins",
    "domain",
    "skills",
    "building-copilot-features",
    "unsafe-test-link",
  );
  writeFileSync(external, "keep\n");
  symlinkSync(external, link);
  t.after(() => rmSync(link, { force: true }));

  const install = run("--install-repo", repo);
  assert.equal(install.status, 1);
  assert.match(install.stderr, /refusing to follow it/);
  assert.equal(readFileSync(external, "utf8"), "keep\n");
  assert.equal(
    existsSync(join(repo, ".agents", "skills", "building-copilot-features")),
    false,
  );
});

test("rejects a symlinked plugin directory and emission target", (t) => {
  const externalPlugin = tempRepo(t);
  const pluginLink = join(root, "plugins", "unsafe-test-plugin");
  symlinkSync(externalPlugin, pluginLink);
  t.after(() => rmSync(pluginLink, { force: true }));

  const installRepo = tempRepo(t);
  const install = run("--install-repo", installRepo);
  assert.equal(install.status, 1);
  assert.match(install.stderr, /unsafe-test-plugin is a symlink/);
  rmSync(pluginLink, { force: true });

  const outputParent = tempRepo(t);
  const externalOutput = tempRepo(t);
  const output = join(outputParent, "dist");
  writeFileSync(join(externalOutput, "sentinel"), "keep\n");
  symlinkSync(externalOutput, output);
  const emission = run("--output", output);
  assert.equal(emission.status, 1);
  assert.match(emission.stderr, /refusing to replace it/);
  assert.equal(readFileSync(join(externalOutput, "sentinel"), "utf8"), "keep\n");
});

test("recovers interrupted skill swaps before reinstalling", (t) => {
  const repo = tempRepo(t);
  assert.equal(run("--install-repo", repo).status, 0);

  const skills = join(repo, ".agents", "skills");
  const skillStageName = ".knowtis-plugins-stage-test123";
  const skillStage = join(skills, skillStageName);
  const skill = join(skills, "investigating-postgres");
  mkdirSync(join(skillStage, "backup"), { recursive: true });
  renameSync(skill, join(skillStage, "backup", "investigating-postgres"));
  mkdirSync(skill);
  writeFileSync(join(skill, "SKILL.md"), "interrupted\n");
  writeFileSync(
    join(skills, ".knowtis-skills-transaction.json"),
    JSON.stringify({
      version: 1,
      stage: skillStageName,
      hadManifest: true,
      swaps: [{ name: "investigating-postgres", hadDestination: true }],
      committed: false,
    }),
  );

  const reinstall = run("--install-repo", repo);
  assert.equal(reinstall.status, 0, reinstall.stderr);
  assert.equal(run("--check", repo).status, 0);
  assert.equal(existsSync(skillStage), false);
  assert.equal(
    existsSync(join(skills, ".knowtis-skills-transaction.json")),
    false,
  );

  writeFileSync(
    join(skills, ".knowtis-skills-transaction.json"),
    JSON.stringify({
      version: 1,
      stage: ".knowtis-plugins-stage-removed",
      hadManifest: true,
      swaps: [],
      committed: true,
    }),
  );
  assert.equal(run("--install-repo", repo).status, 0);
});

test("recovers an interrupted global install before uninstalling", (t) => {
  const home = tempRepo(t);
  const homeEnv = { HOME: home, USERPROFILE: home };
  assert.equal(runWithEnv(homeEnv, "--install-global").status, 0);
  const skills = join(home, ".agents", "skills");
  const stageName = ".knowtis-plugins-stage-uninstall";
  const stage = join(skills, stageName);
  mkdirSync(join(stage, "backup"), { recursive: true });
  renameSync(join(skills, "investigating-postgres"), join(stage, "backup", "investigating-postgres"));
  writeFileSync(
    join(skills, ".knowtis-skills-transaction.json"),
    JSON.stringify({
      version: 1,
      stage: stageName,
      hadManifest: true,
      swaps: [{ name: "investigating-postgres", hadDestination: true }],
      committed: false,
    }),
  );

  const uninstall = runWithEnv(homeEnv, "--uninstall-global");
  assert.equal(uninstall.status, 0, uninstall.stderr);
  assert.equal(existsSync(join(skills, "investigating-postgres")), false);
  assert.equal(
    existsSync(join(skills, ".knowtis-plugins-manifest.json")),
    false,
  );
  assert.equal(existsSync(stage), false);
});
