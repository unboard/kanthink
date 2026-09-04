/**
 * Preflight must never ask for images it already has.
 *
 * Taken from a real session: the user attached three photos of a phonics worksheet,
 * pressed Update, and preflight replied "Could you please provide the image URLs or
 * detailed descriptions of the images you'd like to include?" — cancelling the build
 * while the builder was holding those exact photos.
 */
import { describe, it, expect } from 'vitest'
import { asksForAttachedImages } from '../lib/playground/preflight'

describe('asksForAttachedImages', () => {
  it('catches the question that actually shipped', () => {
    expect(
      asksForAttachedImages(
        "Could you please provide the image URLs or detailed descriptions of the images you'd like to include?"
      )
    ).toBe(true)
  })

  it('catches the placement follow-up that came with it', () => {
    expect(
      asksForAttachedImages(
        'Where specifically should these images be placed within the app (e.g., background, house crests, word cards)?'
      )
    ).toBe(true)
  })

  it('catches the other words people use for a picture', () => {
    for (const q of [
      'Can you share a screenshot of the layout you want?',
      'Do you have a photo of the worksheet?',
      'Which artwork should go on the card backs?',
      'What graphic did you have in mind?',
    ]) {
      expect(asksForAttachedImages(q)).toBe(true)
    }
  })

  it('leaves genuine clarifying questions alone', () => {
    for (const q of [
      'Should the timer count up or down?',
      'Do you want the score saved between sessions?',
      'Should tapping a word reveal the answer, or submit it?',
    ]) {
      expect(asksForAttachedImages(q)).toBe(false)
    }
  })
})
