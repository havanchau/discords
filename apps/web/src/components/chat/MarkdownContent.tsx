import { Fragment, memo, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from '../../i18n/LocaleProvider';
import { cn } from '../../utils/cn';
import { parseMarkdown, type MarkdownNode } from '../../utils/markdown';
import styles from './MarkdownContent.module.css';

/** Returns an image URL for a custom emoji name, or undefined to keep the shortcode as text. */
export type EmojiResolver = (name: string) => string | undefined;

interface MarkdownContentProps {
  content: string;
  resolveEmoji?: EmojiResolver;
  className?: string;
  /** Rendered before the content inside the same block, e.g. an encryption badge. */
  prefix?: ReactNode;
}

export const MarkdownContent = memo(function MarkdownContent({
  content,
  resolveEmoji,
  className,
  prefix,
}: MarkdownContentProps) {
  const nodes = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div className={cn(styles.markdown, className)}>
      {prefix}
      {renderNodes(nodes, resolveEmoji)}
    </div>
  );
});

function renderNodes(nodes: MarkdownNode[], resolveEmoji: EmojiResolver | undefined): ReactNode {
  return nodes.map((node, index) => (
    <Fragment key={index}>{renderNode(node, resolveEmoji)}</Fragment>
  ));
}

function renderNode(node: MarkdownNode, resolveEmoji: EmojiResolver | undefined): ReactNode {
  switch (node.type) {
    case 'text':
      return node.value;
    case 'bold':
      return <strong>{renderNodes(node.children, resolveEmoji)}</strong>;
    case 'italic':
      return <em>{renderNodes(node.children, resolveEmoji)}</em>;
    case 'underline':
      return <u>{renderNodes(node.children, resolveEmoji)}</u>;
    case 'strike':
      return <s>{renderNodes(node.children, resolveEmoji)}</s>;
    case 'spoiler':
      return <Spoiler>{renderNodes(node.children, resolveEmoji)}</Spoiler>;
    case 'inlineCode':
      return <code className={styles.inlineCode}>{node.value}</code>;
    case 'codeBlock':
      return (
        <pre className={styles.codeBlock} data-language={node.language ?? undefined}>
          <code>{node.value}</code>
        </pre>
      );
    case 'blockquote':
      return (
        <blockquote className={styles.blockquote}>
          {renderNodes(node.children, resolveEmoji)}
        </blockquote>
      );
    case 'link':
      return (
        <a href={node.href} target="_blank" rel="noreferrer">
          {node.href}
        </a>
      );
    case 'mention':
      return <span className={styles.mention}>{node.value}</span>;
    case 'emoji': {
      const url = resolveEmoji?.(node.name);
      const shortcode = `:${node.name}:`;
      return url ? (
        <img className={styles.customEmoji} src={url} alt={shortcode} title={shortcode} />
      ) : (
        shortcode
      );
    }
  }
}

function Spoiler({ children }: { children: ReactNode }) {
  const t = useTranslation();
  const [isRevealed, setIsRevealed] = useState(false);

  if (isRevealed) {
    return <span className={cn(styles.spoiler, styles.spoilerRevealed)}>{children}</span>;
  }

  return (
    <button
      type="button"
      className={styles.spoiler}
      aria-label={t('markdown.spoiler')}
      aria-pressed={false}
      onClick={() => setIsRevealed(true)}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
