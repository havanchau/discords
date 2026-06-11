import { Prisma } from '@prisma/client';

export interface MessageSearchFilters {
  search?: string;
  from?: string;
  inChannel?: string;
  hasLink?: boolean;
  hasFile?: boolean;
  before?: string;
  after?: string;
}

export interface NormalizedMessageSearchFilters {
  search?: string;
  from?: string;
  inChannel?: string;
  hasLink: boolean;
  hasFile: boolean;
  before?: Date;
  after?: Date;
}

export function normalizeMessageSearchFilters(
  filters: MessageSearchFilters | undefined,
): NormalizedMessageSearchFilters {
  return {
    search: normalizeTextFilter(filters?.search),
    from: normalizeTextFilter(filters?.from),
    inChannel: normalizeTextFilter(filters?.inChannel),
    hasLink: Boolean(filters?.hasLink),
    hasFile: Boolean(filters?.hasFile),
    before: parseDateFilter(filters?.before, 'before'),
    after: parseDateFilter(filters?.after, 'after'),
  };
}

export function buildMessageSearchWhere(
  filters: NormalizedMessageSearchFilters,
): Prisma.MessageWhereInput[] {
  const where: Prisma.MessageWhereInput[] = [];

  if (filters.search) {
    where.push({ content: { contains: filters.search, mode: 'insensitive' } });
  }

  if (filters.from) {
    where.push({
      author: {
        OR: [
          { username: { contains: filters.from, mode: 'insensitive' } },
          { displayName: { contains: filters.from, mode: 'insensitive' } },
        ],
      },
    });
  }

  if (filters.inChannel) {
    const channelFilter = filters.inChannel.replace(/^#/, '');
    where.push({
      channel: {
        OR: [{ id: channelFilter }, { name: { contains: channelFilter, mode: 'insensitive' } }],
      },
    });
  }

  if (filters.hasFile) {
    where.push({ attachments: { some: {} } });
  }

  if (filters.hasLink) {
    where.push({
      OR: [
        { content: { contains: 'http://', mode: 'insensitive' } },
        { content: { contains: 'https://', mode: 'insensitive' } },
      ],
    });
  }

  if (filters.before || filters.after) {
    where.push({
      createdAt: {
        ...(filters.before ? { lt: filters.before } : {}),
        ...(filters.after ? { gte: filters.after } : {}),
      },
    });
  }

  return where;
}

function normalizeTextFilter(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 120) : undefined;
}

function parseDateFilter(value: string | undefined, mode: 'before' | 'after') {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  if (mode === 'before') {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
}
