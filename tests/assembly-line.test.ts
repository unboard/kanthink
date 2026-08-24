import { describe, it, expect } from 'vitest';
import {
  detectAssemblyLine,
  getAssemblyLineShrooms,
  getShroomsForIntent,
} from '@/lib/channelCreation/generateShrooms';

describe('detectAssemblyLine', () => {
  it('recognises the canonical layout', () => {
    const line = detectAssemblyLine(['Inbox', 'Promising', 'Requirements', 'Spec', 'Design', 'Build']);
    expect(line).toBeTruthy();
    expect(line!.inbox).toBe('Inbox');
    expect(line!.build).toBe('Build');
  });

  it('matches on keywords, not exact names', () => {
    // People name columns whatever they want; the shape is the signal.
    const line = detectAssemblyLine(['Raw Ideas', 'Shortlist', 'PM Notes', 'CTO Spec', 'Ship It']);
    expect(line).toBeTruthy();
    expect(line!.inbox).toBe('Raw Ideas');
    expect(line!.requirements).toBe('PM Notes');
    expect(line!.build).toBe('Ship It');
  });

  it('requires a build column', () => {
    expect(detectAssemblyLine(['Inbox', 'Promising', 'Requirements', 'Design'])).toBeNull();
  });

  it('requires at least two upstream roles', () => {
    // One enrichment before a build is a channel with a build shroom, not a pipeline.
    // Wiring a five-shroom chain onto that would be presumptuous.
    expect(detectAssemblyLine(['Inbox', 'Build'])).toBeNull();
  });

  it('ignores ordinary boards', () => {
    expect(detectAssemblyLine(['Inbox', 'Like', 'Dislike', 'This Week'])).toBeNull();
    expect(detectAssemblyLine(['Backlog', 'Doing', 'Done'])).toBeNull();
  });

  it('claims each column once', () => {
    const line = detectAssemblyLine(['Ideas', 'Promising', 'Design', 'Build']);
    expect(line!.inbox).toBe('Ideas');
    expect(line!.design).toBe('Design');
  });
});

describe('getAssemblyLineShrooms', () => {
  const full = detectAssemblyLine([
    'Inbox', 'Promising', 'Requirements', 'Spec', 'Design', 'Build',
  ])!;

  it('emits a shroom per stage, ending in a build', () => {
    const shrooms = getAssemblyLineShrooms(full, '');
    expect(shrooms.map(s => s.action)).toEqual([
      'generate', 'move', 'modify', 'modify', 'modify', 'build',
    ]);
    expect(shrooms.at(-1)!.title).toBe('Build It');
  });

  it('wires each shroom to its own column', () => {
    const shrooms = getAssemblyLineShrooms(full, '');
    const byTitle = Object.fromEntries(shrooms.map(s => [s.title, s]));
    expect(byTitle['Product Manager'].targetColumnName).toBe('Requirements');
    expect(byTitle['CTO Spec'].targetColumnName).toBe('Spec');
    expect(byTitle['Designer'].targetColumnName).toBe('Design');
    expect(byTitle['Build It'].targetColumnName).toBe('Build');
  });

  it('routes triage from the inbox into the promising column', () => {
    const triage = getAssemblyLineShrooms(full, '').find(s => s.action === 'move')!;
    expect(triage.targetColumnName).toBe('Inbox');
    expect(triage.moveToColumnName).toBe('Promising');
  });

  it('fires every stage after the first on arrival, so the line walks itself', () => {
    const shrooms = getAssemblyLineShrooms(full, '');
    // The generator is the entry point and isn't triggered by a handoff.
    expect(shrooms[0].triggerOnArrival).toBeFalsy();
    for (const s of shrooms.slice(1)) {
      expect(s.triggerOnArrival).toBe(true);
    }
  });

  it('skips stages whose column does not exist', () => {
    const partial = detectAssemblyLine(['Inbox', 'Requirements', 'Build'])!;
    const titles = getAssemblyLineShrooms(partial, '').map(s => s.title);
    expect(titles).toContain('Product Manager');
    expect(titles).toContain('Build It');
    expect(titles).not.toContain('CTO Spec');
    expect(titles).not.toContain('Designer');
  });

  it('threads the topic into the generator', () => {
    const shrooms = getAssemblyLineShrooms(full, ' about birdwatching');
    expect(shrooms[0].instructions).toContain('birdwatching');
  });
});

describe('getShroomsForIntent', () => {
  it('returns the pipeline when the columns describe one', () => {
    const shrooms = getShroomsForIntent(
      'ideas',
      ['Inbox', 'Promising', 'Requirements', 'Spec', 'Design', 'Build'],
    );
    expect(shrooms.some(s => s.action === 'build')).toBe(true);
    expect(shrooms.length).toBeGreaterThan(3);
  });

  it('leaves ordinary channels exactly as they were', () => {
    const shrooms = getShroomsForIntent('ideas', ['Inbox', 'Promising', 'Develop']);
    expect(shrooms).toHaveLength(1);
    expect(shrooms[0].action).toBe('generate');
  });
});
