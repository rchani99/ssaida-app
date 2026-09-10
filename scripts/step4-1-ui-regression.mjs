import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';

import ts from 'typescript';

// Execute the production filter, not a copy of its implementation.
const source = await readFile(
  new URL('../src/features/learning/utils/visible-tasks.ts', import.meta.url),
  'utf8',
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
});
const { mergeVisibleTasks } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);
const oldManual = { id: 'old-manual', study_item_id: null };
const oldRescheduled = { id: 'old-rescheduled', study_item_id: null };
const oldWorkbook = { id: 'old-workbook', study_item_id: 'workbook' };
const today = [
  { id: 'manual-1', study_item_id: null },
  { id: 'manual-2', study_item_id: null },
  { id: 'auto-same', study_item_id: 'workbook' },
  { id: 'auto-other', study_item_id: 'activity' },
];
assert.deepEqual(mergeVisibleTasks([oldManual], today), [oldManual, ...today]);
assert.deepEqual(
  mergeVisibleTasks([oldManual, oldRescheduled, oldWorkbook], today).map((task) => task.id),
  ['old-manual', 'old-rescheduled', 'old-workbook', 'manual-1', 'manual-2', 'auto-other'],
);
assert.deepEqual(mergeVisibleTasks([], today), today);
console.log(
  'PASS continuing task filter: null MANUAL/RESCHEDULED retained; only same non-null StudyItem suppressed',
);
