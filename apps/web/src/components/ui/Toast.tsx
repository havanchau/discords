import * as RadixToast from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './Toast.module.css';

export type ToastMessage = {
  title: ReactNode;
  description?: ReactNode;
  variant?: 'notice' | 'error';
};

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <RadixToast.Provider duration={5000} swipeDirection="right">
      {children}
    </RadixToast.Provider>
  );
}

export function ToastViewport() {
  return <RadixToast.Viewport className={styles.viewport} />;
}

export function Toast({ title, description, variant = 'notice' }: ToastMessage) {
  const isError = variant === 'error';

  return (
    <RadixToast.Root className={styles.root} data-variant={variant} duration={isError ? 2147483647 : 5000}>
      <div className={styles.copy}>
        <RadixToast.Title className={styles.title}>{title}</RadixToast.Title>
        {description ? <RadixToast.Description className={styles.description}>{description}</RadixToast.Description> : null}
      </div>
      {isError ? (
        <RadixToast.Close className={styles.close} aria-label="Dismiss notification">
          <X size={16} aria-hidden="true" />
        </RadixToast.Close>
      ) : null}
    </RadixToast.Root>
  );
}
