import { describe, expect, it } from 'vitest';
import type { SpoilerLevel } from './constants/spoiler-levels';
import { applySpoilerFilter, filterBySpoilerLevel, isSpoilerVisible } from './spoiler';

describe('isSpoilerVisible', () => {
  it.each([
    ['public', 'public', true],
    ['public', 'internal', true],
    ['internal', 'public', false],
    ['internal', 'internal', true],
    ['secret', 'internal', false],
    ['secret', 'secret', true],
  ] as const)('content at %s level is %s for a %s viewer', (content, viewer, expected) => {
    expect(isSpoilerVisible(content, viewer)).toBe(expected);
  });
});

describe('filterBySpoilerLevel', () => {
  const item = (id: string, spoilerLevel: SpoilerLevel) => ({ id, spoilerLevel });

  it('drops secret entities for a public viewer', () => {
    const items = [item('a', 'public'), item('b', 'internal'), item('c', 'secret')];
    expect(filterBySpoilerLevel(items, 'public').map((i) => i.id)).toEqual(['a']);
  });

  it('keeps internal entities for an internal viewer', () => {
    const items = [item('a', 'public'), item('b', 'internal'), item('c', 'secret')];
    expect(filterBySpoilerLevel(items, 'internal').map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('returns an empty list unchanged', () => {
    expect(filterBySpoilerLevel([], 'public')).toEqual([]);
  });
});

describe('applySpoilerFilter', () => {
  it('redacts a nested field group above the ceiling to null', () => {
    const character = {
      id: 'c1',
      spoilerLevel: 'public',
      name: 'Mira',
      secrets: { spoilerLevel: 'secret', value: 'She burned the first map herself.' },
    };
    const filtered = applySpoilerFilter(character, 'internal');
    expect(filtered).toEqual({
      id: 'c1',
      spoilerLevel: 'public',
      name: 'Mira',
      secrets: null,
    });
  });

  it('keeps a nested field group at the ceiling', () => {
    const character = {
      id: 'c1',
      spoilerLevel: 'internal',
      secrets: { spoilerLevel: 'internal', value: 'Visible to the author.' },
    };
    const filtered = applySpoilerFilter(character, 'internal');
    expect(filtered?.secrets).toEqual({ spoilerLevel: 'internal', value: 'Visible to the author.' });
  });

  it('returns null when the entity itself is above the ceiling', () => {
    const character = { id: 'c1', spoilerLevel: 'secret', name: 'The Stranger' };
    expect(applySpoilerFilter(character, 'public')).toBeNull();
  });

  it('redacts over-level elements inside arrays to null without dropping indices', () => {
    const data = {
      spoilerLevel: 'internal',
      entries: [
        { spoilerLevel: 'public', text: 'open' },
        { spoilerLevel: 'secret', text: 'hidden' },
      ],
    };
    const filtered = applySpoilerFilter(data, 'internal');
    expect(filtered?.entries).toEqual([{ spoilerLevel: 'public', text: 'open' }, null]);
  });

  it('does not mutate the input', () => {
    const character = {
      spoilerLevel: 'public',
      secrets: { spoilerLevel: 'secret', value: 'hidden' },
    };
    const snapshot = { spoilerLevel: 'public', secrets: { spoilerLevel: 'secret', value: 'hidden' } };
    applySpoilerFilter(character, 'public');
    expect(character).toEqual(snapshot);
  });

  it('leaves values without a spoilerLevel untouched', () => {
    const date = { year: 512, month: 2, day: 12, order: 186204 };
    expect(applySpoilerFilter({ start: date }, 'public')).toEqual({ start: date });
  });

  it('ignores malformed spoilerLevel strings instead of redacting', () => {
    const doc = { note: { spoilerLevel: 'super-secret', text: 'schema validation owns this case' } };
    expect(applySpoilerFilter(doc, 'public')).toEqual(doc);
  });
});
