import * as RadixToast from '@radix-ui/react-toast';
import type { ReactNode } from 'react';
import styles from './Toast.module.css';

export type ToastMessage = {
  title: ReactNode;
  description?: ReactNode;
};

export const ToastProvider = RadixToast.Provider;

export function ToastViewport() {
  return <RadixToast.Viewport className={styles.viewport} />;
}

export function Toast({ title, description }: ToastMessage) {
  return (
    <RadixToast.Root className={styles.root}>
      <RadixToast.Title className={styles.title}>{title}</RadixToast.Title>
      {description ? <RadixToast.Description className={styles.description}>{description}</RadixToast.Description> : null}
    </RadixToast.Root>
  );
}
