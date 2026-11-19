/**
 * The canvas skill: canvas-shaped apps are built on the kit's InfiniteCanvas, so
 * every one of them gets the same polish. These pin that the skill switches on for
 * the apps it should, stays off for games, and that the kit really exports what the
 * prompt tells the builder to import.
 */
import { describe, expect, it } from 'vitest'
import { CANVAS_PROMPT, isCanvasApp } from '../lib/playground/skills/canvas'

describe('canvas skill', () => {
  it('switches on for apps where you arrange things on a surface', () => {
    for (const brief of [
      'Build a single-page visual remix canvas with drag-and-drop image placement',
      'A moodboard for my kitchen ideas',
      'whiteboard for brainstorming with sticky notes',
      'a collage maker for the girls',
      'Visual Remix Studio — drop in images, scribble on the canvas, remix',
      'an infinite canvas to lay out my photos',
    ]) expect(isCanvasApp(brief), brief).toBe(true)
  })

  it('stays off for ordinary apps and canvas-drawn games', () => {
    for (const brief of [
      'A tip calculator that splits the bill',
      'Times tables practice for a third grader',
      'An arcade shooter drawn on a canvas with a game loop',
      'Habit tracker with streaks',
    ]) expect(isCanvasApp(brief), brief).toBe(false)
  })

  it('keeps applying once an app is built on it', () => {
    expect(isCanvasApp('make the buttons blue', "import { InfiniteCanvas } from 'kit'")).toBe(true)
  })

  it('tells the builder to fill the screen and use the kit, not hand-roll it', () => {
    expect(CANVAS_PROMPT).toMatch(/import \{ InfiniteCanvas, imageItem \} from 'kit'/)
    expect(CANVAS_PROMPT).toMatch(/FILLS the screen/)
    expect(CANVAS_PROMPT).toMatch(/Do not hand-roll pan, zoom, drag, selection or resize handles/)
  })

  it('the kit exports what the prompt promises', async () => {
    const kit: Record<string, unknown> = await import('../public/kit/v1.js')
    expect(typeof kit.InfiniteCanvas).toBe('object') // forwardRef
    expect(typeof kit.imageItem).toBe('function')
  })
})
