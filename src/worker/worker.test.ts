/* eslint-disable ts-patterns/no-magic-numbers -- sizes and counts are the test data */
// The worker's parts that run without a browser: the answer channel and the field views. The whole
// path through a real worker is test/browser/engine-check.html.
import { describe, expect, test } from 'vitest';
import { openSheet } from '../../test/characters.ts';
import { createChannel, sendAnswer, waitForAnswer } from './channel.ts';
import { changedViews, viewsOf } from './views.ts';

describe('channel', () => {
  test('carries an answer from the page to the worker, and is empty again afterwards', () => {
    const channel = createChannel(1024);
    const answer = { type: 'close', result: 'ok', state: { name: 'Zoë •' } };
    sendAnswer(channel, answer);
    expect(waitForAnswer(channel)).toEqual(answer);
    sendAnswer(channel, null);
    expect(waitForAnswer(channel)).toBeNull();
  });

  test('refuses an answer larger than the buffer', () => {
    expect(() => sendAnswer(createChannel(8), 'more than eight bytes')).toThrow('too large');
  });
});

describe('field views', () => {
  test('after an edit, only the fields that look different are sent', () => {
    const engine = openSheet();
    const before = viewsOf(engine.doc);
    engine.edit('PC Name', 'Ada');
    const { changed, removed } = changedViews(before, viewsOf(engine.doc));
    expect(changed['PC Name']?.value).toBe('Ada');
    expect(Object.keys(changed).length).toBeLessThan(Object.keys(before).length / 100);
    expect(removed).toEqual([]);
  });

  test('a new class changes many fields: values, texts and what is shown', () => {
    const engine = openSheet();
    const before = viewsOf(engine.doc);
    engine.edit('Class and Levels', 'Wizard 3');
    const { changed } = changedViews(before, viewsOf(engine.doc));
    expect(changed['Proficiency Bonus']?.value).toBe('2');
    expect(Object.keys(changed).length).toBeGreaterThan(50);
  });
});
