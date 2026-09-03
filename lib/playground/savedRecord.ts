/**
 * Saved records for playground apps.
 *
 * Lets a generated app persist arbitrary JSON records on the server and mint
 * a shareable URL for each one (e.g. `/play/{shareToken}/r/{slug}`). Recipients
 * open the URL and the app loads pre-populated with that record via
 * `window.kanthinkInitial.record`.
 *
 * Records live in `playground_apps.saved_records`, bounded so one app can't
 * grow unbounded.
 */
import { customAlphabet } from 'nanoid';

export interface SavedRecord {
  /** Short URL-safe id used in the public link. */
  slug: string;
  /** Arbitrary JSON the app provided. Capped at MAX_RECORD_BYTES once serialized. */
  data: unknown;
  /** Optional human label for OG titles and listings. */
  label?: string;
  /** Epoch seconds when saved. */
  createdAt: number;
}

/** No confusing chars (0/O, 1/l/I). 8 chars from 31 = ~40 bits, plenty per-card. */
const slugAlphabet = '23456789abcdefghjkmnpqrstuvwxyz';
const slugGen = customAlphabet(slugAlphabet, 8);
export function newRecordSlug(): string {
  return slugGen();
}

/** Hard cap on saved records per app. Oldest gets dropped on overflow. */
export const MAX_RECORDS_PER_APP = 200;

/** Hard cap on a single record's JSON-serialized size, in bytes. */
export const MAX_RECORD_BYTES = 32 * 1024;
