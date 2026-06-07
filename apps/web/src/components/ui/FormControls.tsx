import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../utils/cn';
import styles from './FormControls.module.css';

type FieldShellProps = {
  id?: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
};

function FieldShell({ id, label, hint, error, className, children }: FieldShellProps) {
  return (
    <div className={cn(styles.field, className)}>
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
  fieldClassName?: string;
  leadingIcon?: ReactNode;
  shellClassName?: string;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  (
    {
      className,
      fieldClassName,
      id,
      label,
      hint,
      error,
      leadingIcon,
      shellClassName,
      'aria-invalid': ariaInvalid,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = id ?? (label ? generatedId : undefined);

    return (
      <FieldShell id={inputId} label={label} hint={hint} error={error} className={fieldClassName}>
        <span className={cn(leadingIcon && styles.controlShell, shellClassName)}>
          {leadingIcon ? <span className={styles.leadingIcon}>{leadingIcon}</span> : null}
          <input
            ref={ref}
            id={inputId}
            className={cn(styles.control, leadingIcon && styles.controlWithIcon, className)}
            aria-invalid={ariaInvalid ?? Boolean(error)}
            {...props}
          />
        </span>
      </FieldShell>
    );
  },
);

TextField.displayName = 'TextField';

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  fieldClassName?: string;
};

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className, fieldClassName, id, label, hint, error, 'aria-invalid': ariaInvalid, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id ?? (label ? generatedId : undefined);

    return (
      <FieldShell id={textareaId} label={label} hint={hint} error={error} className={fieldClassName}>
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(styles.control, styles.textarea, className)}
          aria-invalid={ariaInvalid ?? Boolean(error)}
          {...props}
        />
      </FieldShell>
    );
  },
);

TextArea.displayName = 'TextArea';
