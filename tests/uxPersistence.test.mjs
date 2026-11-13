import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
async function load(path) {
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
const { mediaIdentity } = await load('../src/drafts/media.ts');
const { stepsForSave } = await load('../src/drafts/steps.ts');
test('photo retry keeps identity while different files, records and steps remain separate', async () => {
  const blob = new Blob(['first photo'], { type: 'image/jpeg' });
  const first = await mediaIdentity('record-a', undefined, blob);
  assert.equal(await mediaIdentity('record-a', undefined, new Blob(['first photo'], { type: 'image/jpeg' })), first);
  assert.match(first, /^[a-f\d]{8}-[a-f\d]{4}-5[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/);
  assert.notEqual(await mediaIdentity('record-b', undefined, blob), first);
  assert.notEqual(await mediaIdentity('record-a', 'step-a', blob), first);
  assert.notEqual(await mediaIdentity('record-a', undefined, new Blob(['other photo'], { type: 'image/jpeg' })), first);
});
test('photo-only steps survive and removed-only empty steps do not', () => {
  const steps = [
    { id: 'empty', order: 1, body: ' ', mediaIds: [], photoFile: null },
    { id: 'new-photo', order: 2, body: '', mediaIds: [], photoFile: new Blob(['photo']) },
    { id: 'old-photo', order: 3, body: '', mediaIds: ['keep'], photoFile: null },
    { id: 'removed', order: 4, body: '', mediaIds: ['remove'], photoFile: null },
    { id: 'text', order: 5, body: ' stir ', mediaIds: ['remove'], photoFile: null },
  ];
  const result = stepsForSave(steps, new Set(['remove']));
  assert.deepEqual(result.map(step => step.id), ['new-photo', 'old-photo', 'text']);
  assert.deepEqual(result.map(step => step.order), [1, 2, 3]);
  assert.equal(result[2].body, 'stir');
  assert.deepEqual(result[2].mediaIds, []);
  assert.deepEqual(steps[4].mediaIds, ['remove']);
});
