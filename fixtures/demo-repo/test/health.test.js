import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeProject } from '../src/health.js';

test('reports a quiet project when there are no tasks', () => {
  assert.deepEqual(summarizeProject([]), {
    total: 0,
    complete: 0,
    blocked: 0,
    status: 'quiet',
  });
});

test('reports active progress', () => {
  assert.deepEqual(
    summarizeProject([
      { title: 'Plan', status: 'done' },
      { title: 'Build', status: 'in_progress' },
      { title: 'Ship', status: 'todo' },
    ]),
    { total: 3, complete: 1, blocked: 0, status: 'active' },
  );
});

test('blocked work takes priority', () => {
  assert.deepEqual(
    summarizeProject([
      { title: 'Build', status: 'done' },
      { title: 'Ship', status: 'blocked' },
    ]),
    { total: 2, complete: 1, blocked: 1, status: 'blocked' },
  );
});

test('reports completion only when every task is done', () => {
  assert.deepEqual(
    summarizeProject([
      { title: 'Plan', status: 'done' },
      { title: 'Build', status: 'done' },
    ]),
    { total: 2, complete: 2, blocked: 0, status: 'complete' },
  );
});
