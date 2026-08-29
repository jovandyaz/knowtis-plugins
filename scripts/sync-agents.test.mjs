import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
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

test("installs portable skills and detects content drift", (t) => {
  const repo = tempRepo(t);
  assert.equal(run("--install-repo", repo).status, 0);
  assert.equal(run("--check", repo).status, 0);

  const preflight = readFileSync(
    join(repo, ".agents", "skills", "running-preflight", "SKILL.md"),
    "utf8",
  );
  assert.doesNotMatch(preflight, /^disable-model-invocation:/m);

  const manifest = JSON.parse(
    readFileSync(
      join(repo, ".agents", "skills", ".knowtis-plugins-manifest.json"),
      "utf8",
    ),
  );
  assert.match(manifest.deploying.integrity, /^sha256-[a-f0-9]{64}$/);
  assert.ok(
    existsSync(
      join(repo, ".opencode", "agents", ".knowtis-plugins-manifest.json"),
    ),
  );

  appendFileSync(
    join(repo, ".agents", "skills", "deploying", "SKILL.md"),
    "\nlocal drift\n",
  );
  const check = run("--check", repo);
  assert.equal(check.status, 1);
  assert.match(check.stderr, /deploying\/SKILL\.md: differs from source/);
});

test("refuses to overwrite an unrelated skill before installing anything", (t) => {
  const repo = tempRepo(t);
  const skill = join(repo, ".agents", "skills", "deploying");
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

test("refuses to overwrite an unrelated OpenCode agent before installing skills", (t) => {
  const repo = tempRepo(t);
  const agents = join(repo, ".opencode", "agents");
  mkdirSync(agents, { recursive: true });
  writeFileSync(join(agents, "knowtis-architect.md"), "unrelated\n");

  const install = run("--install-repo", repo);
  assert.equal(install.status, 1);
  assert.match(install.stderr, /is not owned by knowtis-plugins/);
  assert.equal(existsSync(join(repo, ".agents", "skills")), false);
});
