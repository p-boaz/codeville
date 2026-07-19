#!/usr/bin/env node
/* global process, setTimeout, clearTimeout */
import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

if (process.argv.includes('--version')) {
  process.stdout.write('codex-cli fixture-1.0.0\n');
  process.exit(0);
}

if (process.argv[2] !== 'app-server') process.exit(2);

const lines = createInterface({ input: process.stdin });
let threadNumber = 0;
let turnNumber = 0;
const nativeByRequest = new Map();
const steerableTurns = new Map();

function send(message) { process.stdout.write(`${JSON.stringify(message)}\n`); }
function log(message) { if (process.env.CODEVILLE_FAKE_LOG) appendFileSync(process.env.CODEVILLE_FAKE_LOG, `${JSON.stringify(message)}\n`); }
function thread(id, cwd) { return { id, sessionId: id, cwd, turns: [], status: { type: 'idle' } }; }
function complete(threadId, turnId, marker = 'CODEVILLE_RESULT: {"status":"completed","landed":"Fixture work completed.","followUp":"No follow-up recommended.","followUpRecommended":false}') {
  send({ method: 'item/completed', params: { threadId, turnId, item: { type: 'agentMessage', id: `item-${turnId}`, text: marker, phase: 'final_answer' } } });
  send({ method: 'turn/completed', params: { threadId, turn: { id: turnId, items: [], itemsView: 'notLoaded', status: 'completed', error: null, startedAt: null, completedAt: null, durationMs: 1 } } });
}

lines.on('line', (line) => {
  const message = JSON.parse(line);
  log(message);
  if (message.method === 'initialize') return send({ id: message.id, result: {} });
  if (message.method === 'thread/start') {
    const id = `019-fixture-thread-${++threadNumber}`;
    return send({ id: message.id, result: { thread: thread(id, message.params.cwd), model: message.params.model, modelProvider: 'fixture', serviceTier: null, cwd: message.params.cwd, instructionSources: [], approvalPolicy: message.params.approvalPolicy, approvalsReviewer: 'user', sandbox: { type: 'workspaceWrite' }, reasoningEffort: null } });
  }
  if (message.method === 'thread/resume') return send({ id: message.id, result: { thread: thread(message.params.threadId, message.params.cwd), model: message.params.model, modelProvider: 'fixture', serviceTier: null, cwd: message.params.cwd, instructionSources: [], approvalPolicy: message.params.approvalPolicy, approvalsReviewer: 'user', sandbox: { type: 'workspaceWrite' }, reasoningEffort: null } });
  if (message.method === 'thread/unsubscribe') return send({ id: message.id, result: { status: 'unsubscribed' } });
  if (message.method === 'skills/list') {
    const cwd = message.params?.cwds?.[0] ?? '/fixture';
    return send({ id: message.id, result: { data: [{ cwd, skills: [
      { name: 'repo-helper', description: 'Repo-specific fixture skill', path: `${cwd}/.codex/skills/repo-helper/SKILL.md`, scope: 'repo', enabled: true },
      { name: 'house-style', description: 'Overarching fixture skill', path: '/fixture/skills/house-style/SKILL.md', scope: 'user', enabled: true },
      { name: 'disabled-skill', description: 'Should be hidden', path: '/fixture/skills/disabled/SKILL.md', scope: 'user', enabled: false },
    ], errors: [] }] } });
  }

  if (message.method === 'turn/interrupt') return send({ id: message.id, result: {} });
  if (message.method === 'turn/steer') {
    send({ id: message.id, result: {} });
    const pending = steerableTurns.get(message.params.expectedTurnId);
    if (pending) {
      clearTimeout(pending.timer);
      steerableTurns.delete(message.params.expectedTurnId);
      setTimeout(() => complete(pending.threadId, message.params.expectedTurnId, 'CODEVILLE_RESULT: {"status":"completed","landed":"Followed the new direction to the letter.","followUp":"No follow-up recommended.","followUpRecommended":false}'), 40);
    }
    return;
  }
  if (message.method === 'turn/start') {
    const turnId = `019-fixture-turn-${++turnNumber}`;
    send({ id: message.id, result: { turn: { id: turnId } } });
    send({ method: 'turn/started', params: { threadId: message.params.threadId, turn: { id: turnId } } });
    const text = message.params.input?.[0]?.text ?? '';
    if (text.includes('fixture:native')) {
      const requestId = 900 + turnNumber;
      nativeByRequest.set(requestId, { threadId: message.params.threadId, turnId });
      return setTimeout(() => send({ method: 'item/tool/requestUserInput', id: requestId, params: { threadId: message.params.threadId, turnId, itemId: `input-${turnId}`, autoResolutionMs: null, questions: [
        { id: 'channel', header: 'Channel', question: 'Which fixture channel?', isOther: true, isSecret: false, options: [{ label: 'Stable', description: 'Stable fixture' }, { label: 'Preview', description: 'Preview fixture' }] },
        { id: 'credential', header: 'Credential', question: 'Enter a temporary fixture credential.', isOther: true, isSecret: true, options: null },
      ] } }), 20);
    }
    if (text.includes('fixture:activity')) {
      const threadId = message.params.threadId;
      const cwd = '/fixture/project';
      const item = (delay, payload) => setTimeout(() => send({ method: 'item/started', params: { threadId, turnId, item: payload } }), delay);
      item(10, { type: 'reasoning', id: `plan-${turnId}`, summary: [], content: [] });
      item(25, { type: 'commandExecution', id: `read-${turnId}`, command: 'cat src/health.js', cwd, processId: null, source: 'agent', status: 'inProgress', commandActions: [{ type: 'read', command: 'cat src/health.js', name: 'health.js', path: `${cwd}/src/health.js` }], aggregatedOutput: null, exitCode: null, durationMs: null });
      item(40, { type: 'fileChange', id: `edit-${turnId}`, status: 'inProgress', changes: [
        { path: `${cwd}/src/health.js`, kind: { type: 'update', move_path: null }, diff: 'fixture-diff' },
        { path: `${cwd}/README.md`, kind: { type: 'update', move_path: null }, diff: 'fixture-diff' },
      ] });
      item(55, { type: 'commandExecution', id: `test-${turnId}`, command: 'pnpm test', cwd, processId: null, source: 'agent', status: 'inProgress', commandActions: [{ type: 'unknown', command: 'pnpm test' }], aggregatedOutput: null, exitCode: null, durationMs: null });
      setTimeout(() => send({ method: 'item/completed', params: { threadId, turnId, item: { type: 'commandExecution', id: `test-${turnId}`, command: 'pnpm test', cwd, processId: null, source: 'agent', status: 'completed', commandActions: [{ type: 'unknown', command: 'pnpm test' }], aggregatedOutput: 'ok', exitCode: 0, durationMs: 5 } } }), 70);
      return setTimeout(() => complete(threadId, turnId, 'CODEVILLE_RESULT: {"status":"completed","landed":"Tightened health checks in src/health.js.","followUp":"No follow-up recommended.","followUpRecommended":false}'), 90);
    }
    if (text.includes('fixture:steerable')) {
      const threadId = message.params.threadId;
      send({ method: 'item/started', params: { threadId, turnId, item: { type: 'reasoning', id: `plan-${turnId}`, summary: [], content: [] } } });
      const timer = setTimeout(() => { steerableTurns.delete(turnId); complete(threadId, turnId); }, 8000);
      steerableTurns.set(turnId, { threadId, timer });
      return;
    }
    if (text.includes('fixture:waiting')) return setTimeout(() => complete(message.params.threadId, turnId, 'CODEVILLE_RESULT: {"status":"waiting_for_input","context":"The fixture pipeline publishes to one of two release channels and both are currently green.","question":"Which fixture channel should continue?","choices":["Stable","Preview"]}'), 20);
    if (text.includes('fixture:review')) return setTimeout(() => complete(message.params.threadId, turnId, 'Turn ended without a marker.'), 20);
    return setTimeout(() => complete(message.params.threadId, turnId), 30);
  }
  if (message.id !== undefined && !message.method && nativeByRequest.has(message.id)) {
    const pending = nativeByRequest.get(message.id);
    nativeByRequest.delete(message.id);
    send({ method: 'serverRequest/resolved', params: { threadId: pending.threadId, requestId: message.id } });
    return setTimeout(() => complete(pending.threadId, pending.turnId), 20);
  }
});
