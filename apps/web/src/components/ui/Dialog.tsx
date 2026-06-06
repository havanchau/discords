import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { IconButton } from './Button';
import styles from './Dialog.module.css';

export type DialogProps = RadixDialog.DialogProps;

export const DialogRoot = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export type DialogContentProps = ComponentPropsWithoutRef<typeof RadixDialog.Content> & {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
};

export function DialogContent({ className, title, description, children, ...props }: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className={styles.overlay} />
      <RadixDialog.Content className={cn(styles.content, className)} {...props}>
        <div className={styles.header}>
          <div>
            <RadixDialog.Title className={styles.title}>{title}</RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className={styles.description}>{description}</RadixDialog.Description>
            ) : null}
          </div>
          <RadixDialog.Close asChild>
            <IconButton label="Close dialog">
              <X size={18} aria-hidden="true" />
            </IconButton>
          </RadixDialog.Close>
        </div>
        <div className={styles.body}>{children}</div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
