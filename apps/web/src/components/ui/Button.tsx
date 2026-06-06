import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../utils/cn';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', fullWidth = false, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(styles.button, styles[variant], styles[size], fullWidth && styles.fullWidth, className)}
      {...props}
    />
  )
);

Button.displayName = 'Button';

export type IconButtonProps = Omit<ButtonProps, 'children'> & {
  label: string;
  children: ReactNode;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, label, title, variant = 'ghost', size = 'md', children, ...props }, ref) => (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={cn(styles.iconButton, className)}
      aria-label={label}
      title={title ?? label}
      {...props}
    >
      {children}
    </Button>
  )
);

IconButton.displayName = 'IconButton';
