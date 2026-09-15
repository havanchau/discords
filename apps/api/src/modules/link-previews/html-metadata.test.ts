import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHtmlMetadata } from './html-metadata';

describe('parseHtmlMetadata', () => {
  it('prefers Open Graph tags over the document title', () => {
    const metadata = parseHtmlMetadata(`
      <html><head>
        <title>Fallback title</title>
        <meta property="og:title" content="OG title">
        <meta property="og:description" content="OG description">
        <meta property="og:site_name" content="Example">
      </head></html>
    `);

    assert.deepEqual(metadata, {
      title: 'OG title',
      description: 'OG description',
      siteName: 'Example',
    });
  });

  it('falls back to twitter tags, the name description, and <title>', () => {
    const metadata = parseHtmlMetadata(`
      <title> Page
        title </title>
      <meta name="description" content="Plain description">
      <meta name="twitter:title" content="">
    `);

    assert.equal(metadata.title, 'Page title');
    assert.equal(metadata.description, 'Plain description');
    assert.equal(metadata.siteName, null);
  });

  it('reads attributes in any order and quote style', () => {
    const metadata = parseHtmlMetadata(`<meta content='Single quoted' property=og:title>`);

    assert.equal(metadata.title, 'Single quoted');
  });

  it('decodes entities', () => {
    const metadata = parseHtmlMetadata(
      '<meta property="og:title" content="Tom &amp; Jerry &#8212; &#x1F600; &quot;hi&quot;">',
    );

    assert.equal(metadata.title, 'Tom & Jerry — 😀 "hi"');
  });

  it('truncates long values', () => {
    const metadata = parseHtmlMetadata(
      `<meta property="og:description" content="${'x'.repeat(400)}">`,
    );

    assert.equal(metadata.description?.length, 300);
    assert.ok(metadata.description?.endsWith('…'));
  });

  it('returns nulls when nothing is present', () => {
    assert.deepEqual(parseHtmlMetadata('<p>no metadata</p>'), {
      title: null,
      description: null,
      siteName: null,
    });
  });
});
