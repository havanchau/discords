import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import styles from './Tooltip.module.css';

export const TooltipProvider = RadixTooltip.Provider;

export type TooltipProps = {
  children: ReactNode;
  content: ReactNode;
  side?: ComponentPropsWithoutRef<typeof RadixTooltip.Content>['side'];
};

export function Tooltip({ children, content, side = 'top' }: TooltipProps) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className={styles.content} side={side} sideOffset={8}>
          {content}
          <RadixTooltip.Arrow className={styles.arrow} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
