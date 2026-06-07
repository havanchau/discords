import { Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  Button,
} from '../ui';
import type { SettingsSelectOption } from './types';

interface SettingsSelectProps<T extends string> {
  name: string;
  label: string;
  defaultValue: T;
  options: SettingsSelectOption<T>[];
  onValueChange?: (value: T) => void;
}

export function SettingsSelect<T extends string>({
  name,
  label,
  defaultValue,
  options,
  onValueChange,
}: SettingsSelectProps<T>) {
  const [value, setValue] = useState(defaultValue);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <label className="settings-field">
      <span>{label}</span>
      <input type="hidden" name={name} value={value} />
      <DropdownMenuRoot>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="secondary" className="settings-select-trigger" aria-label={label}>
            <span>{selected?.label}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="settings-select-menu">
          {options.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => {
                setValue(option.value);
                onValueChange?.(option.value);
              }}
            >
              <span>{option.label}</span>
              {option.value === value ? <Check size={14} aria-hidden="true" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenuRoot>
    </label>
  );
}
