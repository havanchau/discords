import * as RadixContextMenu from '@radix-ui/react-context-menu';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../utils/cn';
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
  return <RadixContextMenu.Item className={cn(styles.item, variant === 'danger' && styles.danger, className)} {...props} />;
}

export function ContextMenuSeparator(props: ComponentPropsWithoutRef<typeof RadixContextMenu.Separator>) {
  return <RadixContextMenu.Separator className={styles.separator} {...props} />;
}
