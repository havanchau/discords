import { isIP } from 'node:net';

type Cidr4 = [number, number];

const BLOCKED_IPV4_RANGES: Cidr4[] = [
  cidr4('0.0.0.0', 8),
  cidr4('10.0.0.0', 8),
  cidr4('100.64.0.0', 10),
  cidr4('127.0.0.0', 8),
  cidr4('169.254.0.0', 16),
  cidr4('172.16.0.0', 12),
  cidr4('192.0.0.0', 24),
  cidr4('192.0.2.0', 24),
  cidr4('192.168.0.0', 16),
  cidr4('198.18.0.0', 15),
  cidr4('198.51.100.0', 24),
  cidr4('203.0.113.0', 24),
  cidr4('224.0.0.0', 4),
  cidr4('240.0.0.0', 4),
];

/** True only for addresses the link preview fetcher may connect to. */
export function isPublicAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string) {
  const value = ipv4ToNumber(address);
  return !BLOCKED_IPV4_RANGES.some(([network, mask]) => (value & mask) >>> 0 === network);
}

function isPublicIpv6(address: string) {
  const groups = expandIpv6(address);
  if (!groups) return false;

  // IPv4-mapped (::ffff:a.b.c.d) addresses are judged as the IPv4 address they carry.
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return isPublicIpv4(groupsToIpv4(groups[6], groups[7]));
  }
  if (groups.every((group) => group === 0)) return false; // ::
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return false; // ::1
  if ((groups[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((groups[0] & 0xffc0) === 0xfe80) return false; // fe80::/10 link local
  if ((groups[0] & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return false; // 2001:db8::/32 documentation
  if (
    groups[0] === 0x0064 &&
    groups[1] === 0xff9b &&
    groups.slice(2, 6).every((group) => group === 0)
  ) {
    return false; // 64:ff9b::/96 NAT64 can reach private IPv4 ranges
  }
  return true;
}

function expandIpv6(address: string): number[] | null {
  let text = address.toLowerCase().split('%')[0];
  const embeddedIpv4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (embeddedIpv4) {
    const value = ipv4ToNumber(embeddedIpv4[1]);
    text = `${text.slice(0, -embeddedIpv4[1].length)}${((value >>> 16) & 0xffff).toString(16)}:${(value & 0xffff).toString(16)}`;
  }

  const [head, tail] = text.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  if (text.includes('::') ? missing < 1 : missing !== 0) return null;

  const groups = [...headGroups, ...Array<string>(Math.max(missing, 0)).fill('0'), ...tailGroups];
  const values = groups.map((group) => Number.parseInt(group, 16));
  return values.length === 8 && values.every((value) => value >= 0 && value <= 0xffff)
    ? values
    : null;
}

function ipv4ToNumber(address: string) {
  return address.split('.').reduce((total, octet) => (total << 8) + Number(octet), 0) >>> 0;
}

function groupsToIpv4(high: number, low: number) {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

function cidr4(network: string, prefix: number): Cidr4 {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return [(ipv4ToNumber(network) & mask) >>> 0, mask];
}
