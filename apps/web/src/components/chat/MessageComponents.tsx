import type { ButtonComponent, SelectComponent } from '@discord-clone/shared';
import type { Message } from '@/api';
import { Button } from '@/components/ui';
import { useComponentInteraction } from '@/hooks/useComponentInteraction';
import { useTranslation } from '@/i18n/LocaleProvider';
import styles from './MessageComponents.module.css';

// LINK is rendered as an anchor, never through this map (Button always renders a <button>).
const BUTTON_VARIANT: Record<
  Exclude<ButtonComponent['style'], 'LINK'>,
  'primary' | 'secondary' | 'danger'
> = {
  PRIMARY: 'primary',
  SECONDARY: 'secondary',
  // No dedicated Button variant; rendered as `secondary` plus a `--state-success`-colored label
  // (`state-success on surface-raised` is an already-verified contrast pair, design-rules.md).
  SUCCESS: 'secondary',
  DANGER: 'danger',
};

/**
 * Renders a bot-attached action row (buttons/select menu) on a message, and owns the click → wait →
 * resolved/timeout flow via `useComponentInteraction` (`bot-message-components.md` → Scope, Changes
 * steps 4-7). `message.components` is bot-authored JSON rendered as ordinary props here — no
 * `dangerouslySetInnerHTML`, and a `LINK` button's `url` only ever reaches an anchor's `href`, never
 * an executed script.
 */
export function MessageComponents({ message }: { message: Message }) {
  const t = useTranslation();
  const { clickComponent, isWaiting, error } = useComponentInteraction();
  const rows = message.components ?? [];
  if (rows.length === 0) return null;

  const waiting = isWaiting(message.id);

  return (
    <div className={styles.wrapper}>
      {rows.map((row, rowIndex) => (
        <div className={styles.row} key={rowIndex}>
          {row.components.map((component, componentIndex) =>
            component.type === 'SELECT' ? (
              <SelectMenu
                key={component.customId}
                component={component}
                disabled={waiting || Boolean(component.disabled)}
                onChoose={(values) => void clickComponent(message, component.customId, values)}
              />
            ) : component.style === 'LINK' ? (
              <a
                key={`${rowIndex}-${componentIndex}`}
                className={styles.link}
                href={component.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {component.label}
              </a>
            ) : (
              <Button
                key={component.customId}
                type="button"
                size="sm"
                variant={BUTTON_VARIANT[component.style]}
                className={component.style === 'SUCCESS' ? styles.success : undefined}
                disabled={waiting || Boolean(component.disabled)}
                onClick={() =>
                  component.customId && void clickComponent(message, component.customId)
                }
              >
                {component.label}
              </Button>
            ),
          )}
        </div>
      ))}
      {waiting ? (
        <span className={styles.waiting} role="status">
          {t('component.interaction.waiting')}
        </span>
      ) : null}
      {error ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function SelectMenu({
  component,
  disabled,
  onChoose,
}: {
  component: SelectComponent;
  disabled: boolean;
  onChoose: (values: string[]) => void;
}) {
  const t = useTranslation();
  return (
    <select
      className={styles.select}
      disabled={disabled}
      defaultValue=""
      aria-label={component.placeholder ?? t('component.select.label')}
      onChange={(event) => {
        const { value } = event.target;
        if (value) onChoose([value]);
      }}
    >
      <option value="" disabled>
        {component.placeholder ?? t('component.select.placeholder')}
      </option>
      {component.options.map((option) => (
        <option key={option.value} value={option.value} title={option.description}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
