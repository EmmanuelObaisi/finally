// One-command E2E: fresh throwaway container (project finally-test, port 8001), Playwright on the host.
// The wrapper always tears the project down and fails on any skipped, flaky or failed test.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROJECT = "finally-test";
const PORT = "8001";
const BASE_URL = `http://localhost:${PORT}`;
const ROOT = path.resolve(import.meta.dirname, "..");
const TEST_DIR = path.join(ROOT, "test");
const COMPOSE_ENV = { ...process.env, COMPOSE_PROJECT_NAME: PROJECT, FINALLY_PORT: PORT };
const COMPOSE = ["compose", "-p", PROJECT, "-f", "docker-compose.yml", "-f", "test/compose.e2e.yml"];

let signal = null;
// An installed handler keeps Node alive on Ctrl+C, so the finally block below always tears down.
process.on("SIGINT", () => (signal = "SIGINT"));
process.on("SIGTERM", () => (signal = "SIGTERM"));

/** Run a compose subcommand at the repo root and return the spawn result. */
function compose(args, options = {}) {
  return spawnSync("docker", [...COMPOSE, ...args], { cwd: ROOT, env: COMPOSE_ENV, ...options });
}

/** Fail unless the container really runs with the mock pins. */
function assertMockPins() {
  const mock = compose(["exec", "-T", "finally", "printenv", "LLM_MOCK"], { encoding: "utf8" });
  const massive = compose(["exec", "-T", "finally", "sh", "-c", 'test -z "$MASSIVE_API_KEY"']);
  if (mock.stdout?.trim() !== "true" || massive.status !== 0) {
    throw new Error("e2e: mock pins are not in effect");
  }
  console.log("e2e: LLM_MOCK=true and MASSIVE_API_KEY empty inside the container");
}

/** Run the Playwright specs from the host and return the process exit code and JSON stats. */
function runPlaywright(containerId, reportFile) {
  const cli = path.join(TEST_DIR, "node_modules", "@playwright", "test", "cli.js");
  const run = spawnSync(process.execPath, [cli, "test", "--reporter=list,json"], {
    cwd: TEST_DIR,
    stdio: "inherit",
    env: {
      ...process.env,
      BASE_URL,
      E2E_FRESH_DB: "1",
      E2E_CONTAINER: containerId,
      PLAYWRIGHT_JSON_OUTPUT_FILE: reportFile,
    },
  });
  if (!fs.existsSync(reportFile)) throw new Error("e2e: Playwright wrote no report");
  return { status: run.status ?? 1, stats: JSON.parse(fs.readFileSync(reportFile, "utf8")).stats };
}

async function main() {
  const reportFile = path.join(os.tmpdir(), `finally-e2e-${Date.now()}.json`);
  try {
    compose(["down", "-v"], { stdio: "inherit" });
    const up = compose(["up", "-d", "--build", "--wait"], { stdio: "inherit" });
    if (up.status !== 0) throw new Error("e2e: the test container did not become healthy");

    const health = await fetch(`${BASE_URL}/api/health`);
    if (health.status !== 200) throw new Error(`e2e: /api/health returned ${health.status}`);
    assertMockPins();

    const containerId = compose(["ps", "-q", "finally"], { encoding: "utf8" }).stdout.trim();
    if (!containerId) throw new Error("e2e: no container id for the finally service");

    const { status, stats } = runPlaywright(containerId, reportFile);
    const { expected: passed, skipped, unexpected: failed, flaky } = stats;
    console.log(`e2e summary: passed ${passed}, skipped ${skipped}, failed ${failed}, flaky ${flaky}`);
    process.exitCode = status || (skipped || flaky || failed || !passed ? 1 : 0);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    compose(["down", "-v"], { stdio: "inherit" });
    fs.rmSync(reportFile, { force: true });
  }
  await new Promise((resolve) => setImmediate(resolve));
  if (signal) process.exitCode = 130;
}

await main();
