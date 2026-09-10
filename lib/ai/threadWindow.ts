/**
 * How much of a thread Kan is given, in one place.
 *
 * These used to be bare numbers at each end of the wire, and they multiplied: the card
 * drawer trimmed the thread to ten messages before sending, and the route trimmed what
 * arrived to ten again. The card went on displaying the instruction that started it
 * while Kan answered as though it had never been said — which is the opposite of what a
 * card is for.
 *
 * The rule the numbers encode: the transport cap is only about the size of the request
 * and must stay comfortably above the window, so trimming for bandwidth can never
 * quietly become trimming for context. `threadWindowIsSound` is asserted by the tests.
 */

/** Messages of a card or channel thread actually handed to the model. */
export const THREAD_WINDOW = 40;

/**
 * How far back attached images are inlined. Text is cheap and images are not — each one
 * is fetched and inlined on every turn — so pictures come from the recent end only.
 * Older attachments are still described in text, so nothing vanishes silently.
 */
export const IMAGE_WINDOW = 8;

/**
 * Most a client sends over the wire. Deliberately larger than THREAD_WINDOW: the server
 * decides what the model sees, this only stops a runaway thread becoming a huge POST.
 */
export const THREAD_TRANSPORT_CAP = 80;

export function threadWindowIsSound(): boolean {
  return THREAD_TRANSPORT_CAP > THREAD_WINDOW && THREAD_WINDOW > IMAGE_WINDOW;
}

/**
 * Index from which attachments are inlined, given how many messages made the window.
 */
export function imageWindowStart(windowLength: number): number {
  return Math.max(0, windowLength - IMAGE_WINDOW);
}
