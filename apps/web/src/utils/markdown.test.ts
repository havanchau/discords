import { extractMarkdownLinks, parseMarkdown } from './markdown';

describe('parseMarkdown', () => {
  it('returns plain text unchanged, including newlines', () => {
    expect(parseMarkdown('hello\nworld')).toEqual([{ type: 'text', value: 'hello\nworld' }]);
  });

  it('parses bold, italic, underline, and strikethrough', () => {
    expect(parseMarkdown('**b** *i* _j_ __u__ ~~s~~')).toEqual([
      { type: 'bold', children: [{ type: 'text', value: 'b' }] },
      { type: 'text', value: ' ' },
      { type: 'italic', children: [{ type: 'text', value: 'i' }] },
      { type: 'text', value: ' ' },
      { type: 'italic', children: [{ type: 'text', value: 'j' }] },
      { type: 'text', value: ' ' },
      { type: 'underline', children: [{ type: 'text', value: 'u' }] },
      { type: 'text', value: ' ' },
      { type: 'strike', children: [{ type: 'text', value: 's' }] },
    ]);
  });

  it('nests formatting inside a spoiler', () => {
    expect(parseMarkdown('||**secret** plan||')).toEqual([
      {
        type: 'spoiler',
        children: [
          { type: 'bold', children: [{ type: 'text', value: 'secret' }] },
          { type: 'text', value: ' plan' },
        ],
      },
    ]);
  });

  it('keeps inline code literal', () => {
    expect(parseMarkdown('run `**not bold**` now')).toEqual([
      { type: 'text', value: 'run ' },
      { type: 'inlineCode', value: '**not bold**' },
      { type: 'text', value: ' now' },
    ]);
  });

  it('does not italicize snake_case words', () => {
    expect(parseMarkdown('use snake_case_name here')).toEqual([
      { type: 'text', value: 'use snake_case_name here' },
    ]);
  });

  it('leaves unclosed markers as text', () => {
    expect(parseMarkdown('**open and ~~also')).toEqual([
      { type: 'text', value: '**open and ~~also' },
    ]);
  });

  it('parses fenced code blocks with and without a language', () => {
    expect(parseMarkdown('before\n```ts\nconst a = 1;\n```\nafter')).toEqual([
      { type: 'text', value: 'before' },
      { type: 'codeBlock', language: 'ts', value: 'const a = 1;' },
      { type: 'text', value: 'after' },
    ]);
    expect(parseMarkdown('```**raw**```')).toEqual([
      { type: 'codeBlock', language: null, value: '**raw**' },
    ]);
  });

  it('does not start a fence without a language with a blank line', () => {
    expect(parseMarkdown('```\nconst a = 1;\n```')).toEqual([
      { type: 'codeBlock', language: null, value: 'const a = 1;' },
    ]);
  });

  it('treats an unclosed code fence as text', () => {
    expect(parseMarkdown('```not closed')).toEqual([{ type: 'text', value: '```not closed' }]);
  });

  it('groups consecutive quote lines into one block quote', () => {
    expect(parseMarkdown('intro\n> line one\n> **line** two\noutro')).toEqual([
      { type: 'text', value: 'intro' },
      {
        type: 'blockquote',
        children: [
          { type: 'text', value: 'line one\n' },
          { type: 'bold', children: [{ type: 'text', value: 'line' }] },
          { type: 'text', value: ' two' },
        ],
      },
      { type: 'text', value: 'outro' },
    ]);
  });

  it('excludes trailing punctuation from links', () => {
    expect(parseMarkdown('see https://example.com/path.')).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'link', href: 'https://example.com/path' },
      { type: 'text', value: '.' },
    ]);
  });

  it('extracts unique links without trailing punctuation, including formatted ones', () => {
    expect(
      extractMarkdownLinks(
        '(https://a.example) **https://b.example.** `https://code.example` https://a.example',
      ),
    ).toEqual(['https://a.example', 'https://b.example']);
  });

  it('parses mentions and emoji shortcodes', () => {
    expect(parseMarkdown('hi @bob :party:')).toEqual([
      { type: 'text', value: 'hi ' },
      { type: 'mention', value: '@bob' },
      { type: 'text', value: ' ' },
      { type: 'emoji', name: 'party' },
    ]);
  });

  it('keeps HTML-like content as text', () => {
    expect(parseMarkdown('<img src=x onerror=alert(1)>')).toEqual([
      { type: 'text', value: '<img src=x onerror=alert(1)>' },
    ]);
  });

  it('renders markers beyond five nesting levels as text', () => {
    expect(parseMarkdown('||**__~~*_x_*~~__**||')).toEqual([
      {
        type: 'spoiler',
        children: [
          {
            type: 'bold',
            children: [
              {
                type: 'underline',
                children: [
                  {
                    type: 'strike',
                    children: [{ type: 'italic', children: [{ type: 'text', value: '_x_' }] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });
});
