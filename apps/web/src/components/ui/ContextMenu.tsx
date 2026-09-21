import * as RadixContextMenu from '@radix-ui/react-context-menu';
import { ChevronRight } from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/utils/cn';
import styles from './ContextMenu.module.css';

export const ContextMenuRoot = RadixContextMenu.Root;
export const ContextMenuTrigger = RadixContextMenu.Trigger;

export function ContextMenuContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RadixContextMenu.Content>) {
  return (
    <RadixContextMenu.Portal>
      <RadixContextMenu.Content className={cn(styles.content, className)} {...props} />
    </RadixContextMenu.Portal>
  );
}

export function ContextMenuItem({
  className,
  variant,
  ...props
}: ComponentPropsWithoutRef<typeof RadixContextMenu.Item> & { variant?: 'danger' }) {
  return (
    <RadixContextMenu.Item
      className={cn(styles.item, variant === 'danger' && styles.danger, className)}
      {...props}
    />
  );
}

export function ContextMenuSeparator(
  props: ComponentPropsWithoutRef<typeof RadixContextMenu.Separator>,
) {
  return <RadixContextMenu.Separator className={styles.separator} {...props} />;
}

export const ContextMenuSub = RadixContextMenu.Sub;

export function ContextMenuSubTrigger({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof RadixContextMenu.SubTrigger>) {
  return (
    <RadixContextMenu.SubTrigger className={cn(styles.item, className)} {...props}>
      {children}
      <ChevronRight size={14} aria-hidden="true" className={styles.subChevron} />
    </RadixContextMenu.SubTrigger>
  );
}

export function ContextMenuSubContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RadixContextMenu.SubContent>) {
  return (
    <RadixContextMenu.Portal>
      <RadixContextMenu.SubContent className={cn(styles.content, className)} {...props} />
    </RadixContextMenu.Portal>
  );
}

/** A non-interactive line of information, e.g. the current state an item below would change. */
export function ContextMenuLabel({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RadixContextMenu.Label>) {
  return <RadixContextMenu.Label className={cn(styles.label, className)} {...props} />;
}
