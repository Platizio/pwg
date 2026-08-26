/**
 * Which videos the /media showcase puts forward.
 *
 * Editorial, not chronological. The newest upload is often a 30-second short;
 * someone landing on this page for the first time should meet the introduction
 * to Platizio Global instead. Reordering the showcase is an edit here.
 *
 * IDs are YouTube video ids, matching `src/videos.ts`. An id that no longer
 * exists there is skipped and the slot filled from the newest remaining
 * videos, so a deleted upload thins the list rather than blanking the section.
 */

/** Large card on the left. */
export const FEATURE_VIDEO_ID = '0Ege3_bYC0Y' // Introducing Platizio Global

/** The three-item list on the right, in display order. */
export const SIDE_VIDEO_IDS: readonly string[] = [
  '71MGWFpYOcI', // Why Indian Investors Need Global Investing
  '6uTyQZgBWw0', // Global ETFs: Markets, Sectors and Themes in One Investment
  'pske1BeHNDM', // How Tax Works in Global Investing
]
