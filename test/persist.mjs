// Persistence and launch check: drives the real start and stop scripts under project finally-persist
// (port 8002, mock pins layered through COMPOSE_FILE) and removes only its own project and volume.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PROJECT = "finally-persist";
const PORT = "8002";
const BASE_URL = `http://localhost:${PORT}`;
const ROOT = path.resolve(import.meta.dirname, "..");
const USE_BASH = process.env.PERSIST_SHELL === "bash" || process.platform !== "win32";
const SHELL_NAME = USE_BASH ? "bash" : "powershell";
const COMPOSE_FILES = [path.join(ROOT, "docker-compose.yml"), path.join(ROOT, "test", "compose.e2e.yml")];
const ENV = {
  ...process.env,
  COMPOSE_PROJECT_NAME: PROJECT,
  FINALLY_PORT: PORT,
  COMPOSE_FILE: COMPOSE_FILES.join(path.delimiter),
  COMPOSE_PATH_SEPARATOR: path.delimiter,
};

let signal = null;
// An installed handler keeps Node alive on Ctrl+C, so the finally block below always cleans up.
process.on("SIGINT", () => (signal = "SIGINT"));
process.on("SIGTERM", () => (signal = "SIGTERM"));

const log = (line) => console.log(`persist: ${line}`);

function check(condition, message) {
  if (!condition) throw new Error(`persist: ${message}`);
}

/** Run docker compose for the private project at the repo root. */
function compose(args, options = {}) {
  return spawnSync("docker", ["compose", "-p", PROJECT, ...args], {
    cwd: ROOT,
    env: ENV,
    encoding: "utf8",
    ...options,
  });
}

/** Run the real start script; stdout is captured, echoed, and returned with the exit status. */
function runStart({ build, env = ENV }) {
  const [cmd, args] = USE_BASH
    ? ["bash", ["scripts/start_mac.sh", ...(build ? ["--build"] : []), "--no-open"]]
    : ["powershell", ["-NoProfile", "-File", "scripts/start_windows.ps1", ...(build ? ["-Build"] : []), "-NoOpen"]];
  return runScript(cmd, args, env);
}

/** Run the real stop script. */
function runStop() {
  const [cmd, args] = USE_BASH
    ? ["bash", ["scripts/stop_mac.sh"]]
    : ["powershell", ["-NoProfile", "-File", "scripts/stop_windows.ps1"]];
  return runScript(cmd, args, ENV);
}

function runScript(cmd, args, env) {
  const run = spawnSync(cmd, args, { cwd: ROOT, env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  process.stdout.write(run.stdout ?? "");
  return { status: run.status, stdout: run.stdout ?? "" };
}

/** The URL a start script printed, or null. */
function printedUrl(stdout) {
  return stdout.match(/FinAlly is running at (http:\/\/localhost:\d+)/)?.[1] ?? null;
}

async function api(method, route, body) {
  const response = await fetch(`${BASE_URL}${route}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  check(response.status === 200, `${method} ${route} returned ${response.status}`);
  return response.json();
}

/** Cash, a ticker to quantity map, and the chat message ids. */
async function snapshot() {
  const portfolio = await api("GET", "/api/portfolio");
  const history = await api("GET", "/api/chat/history");
  return {
    cash: portfolio.cash,
    positions: Object.fromEntries(portfolio.positions.map((p) => [p.ticker, p.quantity])),
    messageIds: history.messages.map((m) => m.id),
  };
}

function assertMockPins() {
  const mock = compose(["exec", "-T", "finally", "printenv", "LLM_MOCK"]);
  const massive = compose(["exec", "-T", "finally", "sh", "-c", 'test -z "$MASSIVE_API_KEY"']);
  check(mock.stdout.trim() === "true" && massive.status === 0, "mock pins are not in effect");
  log("LLM_MOCK=true and MASSIVE_API_KEY empty inside the container");
}

/** Whether the root .env holds a non-empty OPENROUTER_API_KEY; the value is never printed. */
function hostHasKey() {
  const envFile = path.join(ROOT, ".env");
  if (!fs.existsSync(envFile)) return false;
  return /^OPENROUTER_API_KEY=\s*\S/m.test(fs.readFileSync(envFile, "utf8"));
}

function assertEnvDelivery() {
  const inside = compose(["exec", "-T", "finally", "sh", "-c", 'test -n "$OPENROUTER_API_KEY"']).status === 0;
  const onHost = hostHasKey();
  check(inside === onHost, `the root .env (${onHost}) and the container (${inside}) disagree about OPENROUTER_API_KEY`);
  log(
    inside
      ? "env_file delivered OPENROUTER_API_KEY to the container"
      : "no OPENROUTER_API_KEY in the root .env, env_file delivery not exercised",
  );
}

/** A start that cannot become healthy must exit non-zero and print no URL. */
function assertBrokenStartFails() {
  const broken = path.join(ROOT, "test", "compose.broken.yml");
  const env = { ...ENV, COMPOSE_FILE: [...COMPOSE_FILES, broken].join(path.delimiter) };
  const run = runStart({ build: false, env });
  check(run.status !== 0, "a broken start exited 0");
  check(!run.stdout.includes("FinAlly is running at"), "a broken start printed a URL");
  log("a broken start exits non-zero and prints no URL");
}

async function main() {
  try {
    compose(["down", "-v"], { stdio: "inherit" });

    const first = runStart({ build: true });
    check(first.status === 0, "the start script failed");
    check(printedUrl(first.stdout) === BASE_URL, `the start script did not print ${BASE_URL}`);
    log(`started at ${BASE_URL}`);
    const health = await fetch(`${BASE_URL}/api/health`);
    check(health.status === 200, `/api/health returned ${health.status}`);

    const containerId = compose(["ps", "-q", "finally"]).stdout.trim();
    const again = runStart({ build: false });
    check(again.status === 0 && printedUrl(again.stdout) === BASE_URL, "the second start failed or printed another URL");
    check(compose(["ps", "-q", "finally"]).stdout.trim() === containerId, "the second start replaced the container");
    log("second start kept the same container");

    assertMockPins();
    assertEnvDelivery();
    await api("POST", "/api/portfolio/trade", { ticker: "MSFT", quantity: 2, side: "buy" });
    const chat = await api("POST", "/api/chat", { message: "please buy" });
    check(chat.actions[0]?.ok === true, "the mock chat buy did not succeed");
    const before = await snapshot();
    check(before.positions.MSFT === 2 && before.positions.AAPL === 1, "unexpected positions before the stop");
    check(before.messageIds.length === 2, "unexpected chat history before the stop");

    const stop = runStop();
    check(stop.status === 0, "the stop script failed");
    check(compose(["ps", "-aq"]).stdout.trim() === "", "stop left a container behind");
    const volumes = spawnSync("docker", ["volume", "ls", "-q", "--filter", `name=${PROJECT}_finally-data`], {
      encoding: "utf8",
    }).stdout.trim();
    check(volumes === `${PROJECT}_finally-data`, "stop did not keep the data volume");
    log("stop removed the container and kept the volume");
    check(runStop().status === 0, "the second stop failed");
    log("second stop is harmless");

    const second = runStart({ build: false });
    check(second.status === 0, "the restart failed");
    check(printedUrl(second.stdout) === BASE_URL, "the restart printed a different BASE_URL");
    const after = await snapshot();
    check(after.cash === before.cash, `cash changed: ${before.cash} then ${after.cash}`);
    check(JSON.stringify(after.positions) === JSON.stringify(before.positions), "positions changed");
    check(JSON.stringify(after.messageIds) === JSON.stringify(before.messageIds), "chat history changed");
    log("cash, positions and chat history survived stop and start");

    compose(["down", "-v"], { stdio: "inherit" });
    assertBrokenStartFails();

    log(`all checks passed (${SHELL_NAME})`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    compose(["down", "-v"], { stdio: "inherit" });
  }
  await new Promise((resolve) => setImmediate(resolve));
  if (signal) process.exitCode = 130;
}

await main();
