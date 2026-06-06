import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../utils/cn';
import styles from './DropdownMenu.module.css';

export const DropdownMenuRoot = RadixDropdownMenu.Root;
export const DropdownMenuTrigger = RadixDropdownMenu.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentPropsWithoutRef<typeof RadixDropdownMenu.Content>) {
  return (
    <RadixDropdownMenu.Portal>
      <RadixDropdownMenu.Content
        className={cn(styles.content, className)}
        sideOffset={sideOffset}
        {...props}
      />
    </RadixDropdownMenu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RadixDropdownMenu.Item>) {
  return <RadixDropdownMenu.Item className={cn(styles.item, className)} {...props} />;
}

export function DropdownMenuSeparator(
  props: ComponentPropsWithoutRef<typeof RadixDropdownMenu.Separator>,
) {
  return <RadixDropdownMenu.Separator className={styles.separator} {...props} />;
}
