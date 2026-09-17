import { Loader2 } from 'lucide-react';
import type { ServerTemplateSummary } from '@/api';
import { useServerTemplates } from '@/hooks/useServerTemplates';
import { useTranslation } from '@/i18n/LocaleProvider';
import { cn } from '@/utils/cn';
import styles from './TemplatePicker.module.css';

interface TemplatePickerProps {
  /** Null is "start from scratch", the original create flow. */
  value: string | null;
  onChange: (templateId: string | null) => void;
}

/** The first step of "Create server": a built-in or private template, or an empty server. */
export function TemplatePicker({ value, onChange }: TemplatePickerProps) {
  const t = useTranslation();
  const { templates, isLoading, error } = useServerTemplates();
  const builtIns = templates.filter((template) => template.builtInId);
  const privates = templates.filter((template) => !template.builtInId);

  function option(id: string | null, title: string, detail: string) {
    const selected = value === id;
    return (
      <button
        key={id ?? 'scratch'}
        type="button"
        className={cn(styles.option, selected && styles.selected)}
        aria-pressed={selected}
        onClick={() => onChange(id)}
      >
        <strong>{title}</strong>
        <small>{detail}</small>
      </button>
    );
  }

  function templateOption(template: ServerTemplateSummary) {
    const title = template.builtInId
      ? t(`template.builtin.${template.builtInId}.name`)
      : template.name;
    const detail = template.builtInId
      ? t(`template.builtin.${template.builtInId}.description`)
      : t('template.picker.counts', {
          roles: template.roleCount,
          channels: template.channelCount,
        });
    return option(template.id, title, detail);
  }

  return (
    <div className={styles.picker} role="group" aria-label={t('template.picker.label')}>
      {option(null, t('template.picker.scratch'), t('template.picker.scratchHint'))}
      {isLoading ? (
        <p className="empty-note" role="status">
          <Loader2 className="spin" size={14} aria-hidden="true" /> {t('template.picker.loading')}
        </p>
      ) : error ? (
        <p className="empty-note" role="alert">
          {error instanceof Error ? error.message : t('error.fallback.cannot-load-templates')}
        </p>
      ) : (
        <>
          {builtIns.map(templateOption)}
          {privates.length ? (
            <>
              <span className={styles.groupLabel}>{t('template.picker.privateGroup')}</span>
              {privates.map(templateOption)}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
