const defaultWebOrigin = 'http://localhost:5173';

export function parseWebOrigins(rawOrigin = defaultWebOrigin) {
  return rawOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAllowedWebOrigin(origin: string | undefined, webOrigins: string[]) {
  if (!origin) return true;
  if (webOrigins.includes(origin)) return true;

  try {
    const { hostname, protocol } = new URL(origin);
    return protocol === 'https:' && hostname.endsWith('.vercel.app') && webOrigins.includes('https://*.vercel.app');
  } catch {
    return false;
  }
}

export { defaultWebOrigin };
