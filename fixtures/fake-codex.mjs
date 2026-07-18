#!/usr/bin/env node
/* global process, setTimeout */
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
  if (message.method === 'turn/interrupt') return send({ id: message.id, result: {} });
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
    if (text.includes('fixture:waiting')) return setTimeout(() => complete(message.params.threadId, turnId, 'CODEVILLE_RESULT: {"status":"waiting_for_input","question":"Which fixture channel should continue?","choices":["Stable","Preview"]}'), 20);
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
