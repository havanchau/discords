import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';
import styles from './FormControls.module.css';

type FieldShellProps = {
  id?: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
};

function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  return (
    <div className={styles.field}>
      {label ? (
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
      ) : null}
      {children}
      {error ? <span className={styles.error}>{error}</span> : hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
}

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ className, id, label, hint, error, 'aria-invalid': ariaInvalid, ...props }, ref) => (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        ref={ref}
        id={id}
        className={cn(styles.control, className)}
        aria-invalid={ariaInvalid ?? Boolean(error)}
        {...props}
      />
    </FieldShell>
  )
);

TextField.displayName = 'TextField';

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className, id, label, hint, error, 'aria-invalid': ariaInvalid, ...props }, ref) => (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <textarea
        ref={ref}
        id={id}
        className={cn(styles.control, styles.textarea, className)}
        aria-invalid={ariaInvalid ?? Boolean(error)}
        {...props}
      />
    </FieldShell>
  )
);

TextArea.displayName = 'TextArea';
