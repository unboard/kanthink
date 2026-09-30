import { describe, it, expect } from 'vitest';
import { normalizeChannelConfig, parseChannelConfigJson } from '@/lib/channelCreation/extractChannelConfig';
import { fallbackChannelConfig } from '@/lib/channelCreation/designChannel';

describe('normalizeChannelConfig', () => {
  it('keeps column descriptions and build shrooms, and re-aims shrooms at real columns', () => {
    const config = normalizeChannelConfig({
      name: 'Ventures',
      instructions: 'Grade every idea.',
      columns: [
        { name: 'Inbox', description: 'New ideas' },
        { name: 'Pitch', description: 'Ready to present' },
      ],
      shrooms: [
        { title: 'Generate', action: 'generate', targetColumnName: 'Inbox', instructions: 'Pitch it.' },
        { title: 'Present', action: 'build', targetColumnName: 'pitch', instructions: 'Make a deck.', triggerOnArrival: true },
        { title: 'Lost', action: 'modify', targetColumnName: 'Nowhere', instructions: 'Enrich.' },
        { title: 'Empty', action: 'generate', targetColumnName: 'Inbox', instructions: '' },
      ],
    });

    expect(config?.columns[0]).toMatchObject({ name: 'Inbox', description: 'New ideas', isAiTarget: true });
    expect(config?.shrooms.map((s) => s.title)).toEqual(['Generate', 'Present', 'Lost']);
    expect(config?.shrooms[0].cardCount).toBe(5);
    expect(config?.shrooms[1]).toMatchObject({ action: 'build', targetColumnName: 'Pitch', triggerOnArrival: true });
    expect(config?.shrooms[2].targetColumnName).toBe('Inbox');
  });

  it('does not truncate long instructions', () => {
    const long = 'Requirement. '.repeat(400);
    expect(normalizeChannelConfig({ name: 'X', instructions: long, columns: [{ name: 'A' }] })?.instructions)
      .toBe(long.trim());
  });

  it('reads a config wrapped in prose or fences', () => {
    const config = parseChannelConfigJson('Here you go:\n```json\n{"name":"A","columns":[{"name":"Inbox"}]}\n```');
    expect(config?.name).toBe('A');
  });
});

describe('fallbackChannelConfig', () => {
  it('does not turn an ideas channel into the app assembly line', () => {
    const config = fallbackChannelConfig({ name: 'Business Ideas', brief: 'Brainstorm business ideas based in data' });
    expect(config.columns.map((c) => c.name)).not.toContain('Spec');
    expect(config.instructions).toBe('Brainstorm business ideas based in data');
  });

  it('still offers the assembly line to someone asking for apps', () => {
    const config = fallbackChannelConfig({ name: 'App Ideas', brief: 'Brainstorm ideas and build apps from them' });
    expect(config.columns.map((c) => c.name)).toContain('Build');
    expect(config.shrooms.some((s) => s.action === 'build' && s.triggerOnArrival)).toBe(true);
  });
});
