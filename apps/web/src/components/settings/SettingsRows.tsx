import type { ReactNode } from 'react';
import { Checkbox, Switch } from '../ui';

interface SwitchRowProps {
  title: string;
  description: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  name?: string;
  onCheckedChange?: (checked: boolean) => void;
}

export function SwitchRow({
  title,
  description,
  checked,
  defaultChecked,
  disabled,
  name,
  onCheckedChange,
}: SwitchRowProps) {
  return (
    <div className="settings-field switch-row">
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <Switch
        name={name}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        aria-label={title}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

interface CheckRowProps {
  className: string;
  children: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  name?: string;
  value?: string;
  label: string;
  onCheckedChange?: (checked: boolean) => void;
}

export function CheckRow({
  className,
  children,
  checked,
  defaultChecked,
  disabled,
  name,
  value,
  label,
  onCheckedChange,
}: CheckRowProps) {
  return (
    <label className={className}>
      <Checkbox
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        aria-label={label}
        onCheckedChange={(nextChecked) => onCheckedChange?.(nextChecked === true)}
      />
      {children}
    </label>
  );
}
