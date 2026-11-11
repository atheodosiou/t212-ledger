/**
 * The app's presentation video on YouTube (shown on the accounts page). Only the ID,
 * e.g. "dQw4w9WgXcQ" from https://youtu.be/dQw4w9WgXcQ. Empty: the card is hidden.
 * The video must allow embedding (YouTube Studio → Show more → Allow embedding).
 */
export const INTRO_VIDEO_ID = 'cBx0VcM2lRo';

/** Privacy-enhanced embed: no YouTube cookies until the viewer presses play. */
export function introEmbedUrl(id: string): string {
  const params = new URLSearchParams({ autoplay: '1', rel: '0', playsinline: '1' });
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${params}`;
}
