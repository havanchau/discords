import { useRef, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import {
  RESERVED_SLASH_COMMAND_NAMES,
  SLASH_COMMAND_NAME_PATTERN,
  SLASH_COMMAND_OPTIONS_MAX,
  type SlashCommandOption,
  type SlashCommandOptionType,
} from '@discord-clone/shared';
import { Banner, Button, Checkbox, IconButton, TextField } from '@/components/ui';
import { SettingsSelect } from '@/components/settings/SettingsSelect';
import type { BotSlashCommand } from '@/hooks/useBotCommands';
import { useTranslation, type MessageKey, type Translate } from '@/i18n/LocaleProvider';
import styles from './BotCommandsDialog.module.css';

const OPTION_TYPE_LABELS: Record<SlashCommandOptionType, MessageKey> = {
  STRING: 'bot.commands.optionType.STRING',
  INTEGER: 'bot.commands.optionType.INTEGER',
  BOOLEAN: 'bot.commands.optionType.BOOLEAN',
  USER: 'bot.commands.optionType.USER',
  CHANNEL: 'bot.commands.optionType.CHANNEL',
};

const OPTION_TYPES = Object.keys(OPTION_TYPE_LABELS) as SlashCommandOptionType[];
/** Both names cap at 32: `SLASH_COMMAND_NAME_PATTERN` for the command, `SlashCommandOptionDto` for an option. */
const NAME_MAX = 32;
/** `CreateSlashCommandDto` and `SlashCommandOptionDto` both cap a description at 100. */
const DESCRIPTION_MAX = 100;

/** What the dialog sends to the API once the draft below passes its local checks. */
export interface CommandInput {
  name: string;
  description: string;
  options: SlashCommandOption[];
}

/** A draft option carries a stable key so removing a row does not shift the others' select state. */
interface DraftOption extends SlashCommandOption {
  key: string;
}

interface CommandFormProps {
  /** `null` while creating; an existing command makes `name` read-only (it is immutable server-side). */
  command: BotSlashCommand | null;
  isBusy: boolean;
  onCancel: () => void;
  onSubmit: (input: CommandInput) => Promise<void>;
}

/** Returns the first rule the draft breaks, as a message, or `null` when it is submittable. */
function draftProblem(
  t: Translate,
  isExisting: boolean,
  name: string,
  description: string,
  options: DraftOption[],
) {
  const trimmedName = name.trim().toLowerCase();
  if (!isExisting && !SLASH_COMMAND_NAME_PATTERN.test(trimmedName)) {
    return t('bot.commands.error.nameInvalid');
  }
  if (!isExisting && (RESERVED_SLASH_COMMAND_NAMES as readonly string[]).includes(trimmedName)) {
    return t('bot.commands.error.nameReserved');
  }
  if (!description.trim()) return t('bot.commands.error.descriptionRequired');
  if (options.some((option) => !option.name.trim() || !option.description.trim())) {
    return t('bot.commands.error.optionIncomplete');
  }
  return null;
}

export function CommandForm({ command, isBusy, onCancel, onSubmit }: CommandFormProps) {
  const t = useTranslation();
  const keySeed = useRef(0);
  const [name, setName] = useState(command?.name ?? '');
  const [description, setDescription] = useState(command?.description ?? '');
  const [options, setOptions] = useState<DraftOption[]>(
    () => command?.options.map((option, index) => ({ ...option, key: `saved-${index}` })) ?? [],
  );
  const [problem, setProblem] = useState<string | null>(null);

  function patchOption(key: string, changes: Partial<SlashCommandOption>) {
    setOptions((current) =>
      current.map((option) => (option.key === key ? { ...option, ...changes } : option)),
    );
  }

  function submit() {
    const found = draftProblem(t, Boolean(command), name, description, options);
    setProblem(found);
    if (found) return;
    void onSubmit({
      name: name.trim().toLowerCase(),
      description: description.trim(),
      options: options.map(
        ({ name: optionName, description: optionDescription, type, required }) => ({
          name: optionName.trim(),
          description: optionDescription.trim(),
          type,
          required,
        }),
      ),
    });
  }

  return (
    <div className={styles.form}>
      <TextField
        label={t('bot.commands.field.name')}
        hint={t('bot.commands.field.nameHint')}
        value={name}
        readOnly={Boolean(command)}
        maxLength={NAME_MAX}
        onChange={(event) => setName(event.target.value)}
      />
      <TextField
        label={t('bot.commands.field.description')}
        value={description}
        maxLength={DESCRIPTION_MAX}
        onChange={(event) => setDescription(event.target.value)}
      />

      <strong>{t('bot.commands.options.title')}</strong>
      {options.length ? (
        options.map((option) => (
          <div className={styles.option} key={option.key}>
            <TextField
              label={t('bot.commands.field.optionName')}
              value={option.name}
              maxLength={NAME_MAX}
              onChange={(event) => patchOption(option.key, { name: event.target.value })}
            />
            <TextField
              label={t('bot.commands.field.optionDescription')}
              value={option.description}
              maxLength={DESCRIPTION_MAX}
              onChange={(event) => patchOption(option.key, { description: event.target.value })}
            />
            <SettingsSelect
              name={`option-type-${option.key}`}
              label={t('bot.commands.field.optionType')}
              defaultValue={option.type}
              options={OPTION_TYPES.map((type) => ({
                value: type,
                label: t(OPTION_TYPE_LABELS[type]),
              }))}
              onValueChange={(type) => patchOption(option.key, { type })}
            />
            <label className={styles.required}>
              <Checkbox
                checked={option.required ?? false}
                aria-label={t('bot.commands.field.optionRequired')}
                onCheckedChange={(checked) =>
                  patchOption(option.key, { required: checked === true })
                }
              />
              <span>{t('bot.commands.field.optionRequired')}</span>
            </label>
            <IconButton
              label={t('bot.commands.action.removeOption')}
              variant="danger"
              size="sm"
              onClick={() => setOptions((current) => current.filter((it) => it.key !== option.key))}
            >
              <X size={14} aria-hidden="true" />
            </IconButton>
          </div>
        ))
      ) : (
        <p className="empty-note">{t('bot.commands.options.empty')}</p>
      )}

      {problem ? <Banner variant="danger">{problem}</Banner> : null}

      <div className={styles.footer}>
        <Button
          variant="secondary"
          disabled={options.length >= SLASH_COMMAND_OPTIONS_MAX}
          onClick={() =>
            setOptions((current) => [
              ...current,
              {
                key: `draft-${++keySeed.current}`,
                name: '',
                description: '',
                type: 'STRING',
                required: false,
              },
            ])
          }
        >
          <Plus size={14} aria-hidden="true" />
          {t('bot.commands.action.addOption')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button disabled={isBusy} onClick={submit}>
          {isBusy ? <Loader2 className="spin" size={14} aria-hidden="true" /> : null}
          {command ? t('bot.commands.action.save') : t('bot.commands.action.create')}
        </Button>
      </div>
    </div>
  );
}
