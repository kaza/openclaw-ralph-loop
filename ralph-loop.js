#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env'));

const GATEWAY_URL = process.env.RALPH_GATEWAY_URL || 'http://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || process.env.RALPH_GATEWAY_TOKEN || '';
const SESSION_KEY = process.env.RALPH_SESSION_KEY || 'agent:main:supervisor:ralph-loop';
const LOG_PATH = path.resolve(process.env.RALPH_LOG_PATH || './ralph-loop.log');
const LOCK_PATH = path.resolve(process.env.RALPH_LOCK_PATH || './ralph-loop.lock');
const TARGET = Number(process.env.RALPH_TARGET || '2');
const STALE_MS = Number(process.env.RALPH_STALE_MS || String(10 * 60 * 1000));
const INTERVAL_MS = Number(process.env.RALPH_INTERVAL_MS || String(60 * 1000));
const LABEL_PREFIX = process.env.RALPH_LABEL_PREFIX || 'ralph-worker-';
const WORKER_TASK = process.env.RALPH_WORKER_TASK || 'Write exactly one short 4-line poem and nothing else.';

if (!GATEWAY_TOKEN) throw new Error('Missing OPENCLAW_GATEWAY_TOKEN or RALPH_GATEWAY_TOKEN');
fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });

function ts() { return new Date().toISOString(); }
function log(message) { fs.appendFileSync(LOG_PATH, `${ts()} ${message}\n`); }
function randomLabel() { return `${LABEL_PREFIX}${Math.random().toString(16).slice(2, 8)}`; }

async function invokeTool(tool, args) {
  const response = await fetch(`${GATEWAY_URL}/tools/invoke`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GATEWAY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tool, args, sessionKey: SESSION_KEY }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`${tool} failed: ${data?.error?.message || response.statusText}`);
  }
  return data.result.details || data.result;
}

function alreadyLogged(runId) {
  try { return fs.readFileSync(LOG_PATH, 'utf8').includes(`runId=${runId} `); }
  catch { return false; }
}

function extractSnippet(history) {
  const parts = [];
  for (const msg of history?.messages || []) {
    if (msg.role !== 'assistant') continue;
    for (const item of msg.content || []) {
      if (item.type === 'text' && item.text && item.text !== 'NO_REPLY') parts.push(item.text.trim());
    }
  }
  return parts.join(' | ').replace(/\s+/g, ' ').slice(0, 300) || '-';
}

async function logRecentCompletions(entries) {
  for (const item of entries || []) {
    if (!item.runId || alreadyLogged(item.runId)) continue;
    let snippet = '-';
    try {
      const history = await invokeTool('sessions_history', { sessionKey: item.sessionKey, limit: 20, includeTools: false });
      snippet = extractSnippet(history);
    } catch (error) {
      snippet = `history-error:${error.message}`;
    }
    log(`result runId=${item.runId} label=${item.label || '-'} status=${item.status || '-'} snippet=${snippet}`);
  }
}

async function tick() {
  const first = await invokeTool('subagents', { action: 'list', recentMinutes: 120 });
  const active = (first.active || []).filter(x => (x.label || '').startsWith(LABEL_PREFIX) && x.status === 'running');
  const stale = active.filter(x => Number(x.runtimeMs || 0) > STALE_MS);

  for (const worker of stale) {
    await invokeTool('subagents', { action: 'kill', target: worker.runId });
  }

  const second = await invokeTool('subagents', { action: 'list', recentMinutes: 120 });
  const healthy = (second.active || []).filter(x => (x.label || '').startsWith(LABEL_PREFIX) && x.status === 'running' && Number(x.runtimeMs || 0) <= STALE_MS);
  const need = Math.max(0, TARGET - healthy.length);
  const spawned = [];

  for (let i = 0; i < need; i++) {
    const label = randomLabel();
    const result = await invokeTool('sessions_spawn', {
      task: WORKER_TASK,
      label,
      runtime: process.env.RALPH_SPAWN_RUNTIME || 'subagent',
      agentId: process.env.RALPH_SPAWN_AGENT_ID || 'codex-reasoning',
      model: process.env.RALPH_SPAWN_MODEL || 'codex',
      thinking: process.env.RALPH_SPAWN_THINKING || 'low',
      mode: process.env.RALPH_SPAWN_MODE || 'run',
      runTimeoutSeconds: Number(process.env.RALPH_SPAWN_RUN_TIMEOUT_SECONDS || '300'),
      timeoutSeconds: Number(process.env.RALPH_SPAWN_TIMEOUT_SECONDS || '0'),
      cleanup: process.env.RALPH_SPAWN_CLEANUP || 'keep',
    });
    spawned.push({ label, runId: result.runId || '' });
  }

  await logRecentCompletions(second.recent || []);
  log(`tick pid=${process.pid} target=${TARGET} healthy=${healthy.length} staleKilled=${stale.length} spawned=${spawned.length} labels=${spawned.map(x => x.label).join(',') || '-'}`);
}

async function main() {
  try {
    const fd = fs.openSync(LOCK_PATH, 'wx');
    fs.writeFileSync(fd, String(process.pid));
    process.on('exit', () => { try { fs.unlinkSync(LOCK_PATH); } catch {} });
    process.on('SIGINT', () => process.exit(0));
    process.on('SIGTERM', () => process.exit(0));
  } catch {
    log('already-running');
    process.exit(0);
  }

  log(`started pid=${process.pid} target=${TARGET} staleMs=${STALE_MS} intervalMs=${INTERVAL_MS}`);
  while (true) {
    try {
      await tick();
    } catch (error) {
      log(`error ${String(error.message || error).replace(/\s+/g, ' ').slice(0, 300)}`);
    }
    await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
  }
}

main().catch(error => {
  log(`fatal ${String(error.message || error).replace(/\s+/g, ' ').slice(0, 300)}`);
  process.exit(1);
});
