const BROWSERS: Array<[RegExp, string]> = [
  [/Edg(?:e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const OPERATING_SYSTEMS: Array<[RegExp, string]> = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

/** A short, human-readable device label such as "Chrome on Windows". */
export function describeUserAgent(userAgent: string | null | undefined) {
  if (!userAgent) return 'Unknown device';
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const operatingSystem = OPERATING_SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser && operatingSystem) return `${browser} on ${operatingSystem}`;
  return browser ?? operatingSystem ?? 'Unknown device';
}
