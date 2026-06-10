import { describe, expect, it } from 'vitest';
import { buildMessageSearchParams, parseMessageSearchQuery } from './messageSearch';

describe('message search parser', () => {
  it('parses supported operators and keeps free text as search text', () => {
    expect(
      parseMessageSearchQuery(
        'deploy notes from:chau in:#general has:link has:file before:2026-06-01 after:2026-05-01',
      ),
    ).toMatchObject({
      text: 'deploy notes',
      from: 'chau',
      in: 'general',
      has: ['link', 'file'],
      before: '2026-06-01',
      after: '2026-05-01',
      invalid: [],
    });
  });

  it('reports unsupported has values and invalid dates without dropping text', () => {
    expect(parseMessageSearchQuery('roadmap has:image before:yesterday after:2026-02-31')).toMatchObject({
      text: 'roadmap',
      has: [],
      invalid: [
        'has:image is not supported',
        'before:yesterday is not a valid date',
        'after:2026-02-31 is not a valid date',
      ],
    });
  });

  it('builds API params while preserving the legacy search parameter', () => {
    const { params } = buildMessageSearchParams('hello from:"Ha Chau" has:file after:2026-01-31');

    expect(params.get('search')).toBe('hello');
    expect(params.get('from')).toBe('Ha Chau');
    expect(params.get('hasFile')).toBe('true');
    expect(params.get('after')).toBe('2026-01-31');
  });
});
