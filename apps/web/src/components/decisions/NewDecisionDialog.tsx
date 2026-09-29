import { FormEvent, useRef, useState } from 'react';
import { Loader2, Paperclip, X } from 'lucide-react';
import { DECISION_TITLE_MAX_LENGTH } from '@discord-clone/shared';
import {
  Button,
  DialogContent,
  DialogRoot,
  IconButton,
  TextArea,
  TextField,
} from '@/components/ui';
import { reminderInputToIso, reminderIsoToInput } from '@/components/saved/ReminderPicker';
import type { NewDecision } from '@/hooks/useDecisions';
import { useTranslation } from '@/i18n/LocaleProvider';
import styles from './Decision.module.css';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/**
 * Mirrors `validatePollExpiry`'s window (5 minutes to 7 days) so the field does not offer an
 * obviously invalid deadline; the API is still the one that enforces it (same pattern as
 * `SendAtField`'s `MAX_LEAD_MS` comment).
 */
const MIN_DEADLINE_LEAD_MS = 5 * MINUTE_MS;
const MAX_DEADLINE_LEAD_MS = 7 * DAY_MS;

interface NewDecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSubmitting: boolean;
  onSubmit: (decision: NewDecision) => Promise<unknown>;
}

export function NewDecisionDialog({
  open,
  onOpenChange,
  isSubmitting,
  onSubmit,
}: NewDecisionDialogProps) {
  const t = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [votingDeadlineAt, setVotingDeadlineAt] = useState('');
  const [quorumCount, setQuorumCount] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = Boolean(title.trim()) && Boolean(votingDeadlineAt);
  const now = Date.now();

  function reset() {
    setTitle('');
    setContent('');
    setVotingDeadlineAt('');
    setQuorumCount('');
    setFiles([]);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const votingDeadlineIso = reminderInputToIso(votingDeadlineAt);
    if (!canSubmit || isSubmitting || !votingDeadlineIso) return;
    setError(null);
    try {
      await onSubmit({
        title: title.trim(),
        content: content.trim(),
        files,
        votingDeadlineAt: votingDeadlineIso,
        quorumCount: quorumCount ? Number(quorumCount) : undefined,
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.fallback.cannot-create-decision'));
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('decision.form.title')} description={t('decision.form.description')}>
        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          <TextField
            label={t('decision.form.proposalTitle')}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={DECISION_TITLE_MAX_LENGTH}
            required
            autoFocus
          />
          <TextArea
            label={t('decision.form.content')}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={4000}
            rows={6}
          />
          <div className={styles.formRow}>
            <TextField
              type="datetime-local"
              label={t('decision.form.votingDeadline')}
              value={votingDeadlineAt}
              min={reminderIsoToInput(new Date(now + MIN_DEADLINE_LEAD_MS).toISOString())}
              max={reminderIsoToInput(new Date(now + MAX_DEADLINE_LEAD_MS).toISOString())}
              onChange={(event) => setVotingDeadlineAt(event.target.value)}
              required
            />
            <TextField
              type="number"
              min={1}
              step={1}
              label={t('decision.form.quorum')}
              hint={t('decision.form.quorumHint')}
              value={quorumCount}
              onChange={(event) => setQuorumCount(event.target.value)}
            />
          </div>
          <div className={styles.files}>
            <input
              ref={fileInputRef}
              className={styles.hiddenInput}
              type="file"
              multiple
              onChange={(event) => {
                const selected = Array.from(event.target.files ?? []);
                setFiles((current) => [...current, ...selected]);
                event.target.value = '';
              }}
            />
            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Paperclip size={16} aria-hidden="true" />
              {t('decision.form.attach')}
            </Button>
            {files.map((file, index) => (
              <span key={`${file.name}-${index}`}>
                {file.name}
                <IconButton
                  label={t('decision.form.removeFile', { name: file.name })}
                  size="sm"
                  onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                >
                  <X size={14} aria-hidden="true" />
                </IconButton>
              </span>
            ))}
          </div>
          {error ? (
            <p className="empty-note" role="alert">
              {error}
            </p>
          ) : null}
          <div className={styles.formFooter}>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
              {t('decision.form.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
