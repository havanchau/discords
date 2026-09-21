/**
 * Whether this browser can capture a screen. Mobile browsers ship `mediaDevices` without
 * `getDisplayMedia` (and insecure origins have no `mediaDevices` at all), so the share action is
 * hidden there instead of failing once clicked.
 */
export function canShareScreen(): boolean {
  if (typeof navigator === 'undefined' || !('mediaDevices' in navigator)) return false;
  return 'getDisplayMedia' in navigator.mediaDevices;
}
