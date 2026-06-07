import * as RadixCheckbox from '@radix-ui/react-checkbox';
import * as RadixSwitch from '@radix-ui/react-switch';
import { Check } from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../utils/cn';
import styles from './SelectionControls.module.css';

export function Checkbox({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RadixCheckbox.Root>) {
  return (
    <RadixCheckbox.Root className={cn(styles.checkbox, className)} {...props}>
      <RadixCheckbox.Indicator className={styles.indicator}>
        <Check size={14} strokeWidth={3} aria-hidden="true" />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}

export function Switch({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof RadixSwitch.Root>) {
  return (
    <RadixSwitch.Root className={cn(styles.switch, className)} {...props}>
      <RadixSwitch.Thumb className={styles.thumb} />
    </RadixSwitch.Root>
  );
}
