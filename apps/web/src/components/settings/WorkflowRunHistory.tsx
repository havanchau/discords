import { Loader2 } from 'lucide-react';
import type { WorkflowRunView, WorkflowView } from '@/api';
import { Badge, Button } from '@/components/ui';
import { useWorkflowRuns } from '@/hooks/useWorkflowRuns';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import settingsStyles from '@/components/SettingsModal.module.css';
import styles from './WorkflowsSection.module.css';

interface WorkflowRunHistoryProps {
  workflow: WorkflowView;
  onClose: () => void;
}

/** A workflow's run history (max 50, newest first), read-only. */
export function WorkflowRunHistory({ workflow, onClose }: WorkflowRunHistoryProps) {
  const t = useTranslation();
  const { absolute } = useDateFormat();
  const { runs, isLoading, error } = useWorkflowRuns(workflow.id);

  return (
    <section className={styles.form} aria-labelledby="workflow-runs-title">
      <strong id="workflow-runs-title">{t('workflows.runs.title', { name: workflow.name })}</strong>
      <div className={settingsStyles.inviteList}>
        {isLoading ? (
          <p className="empty-note" role="status">
            <Loader2 className="spin" size={14} aria-hidden="true" /> {t('workflows.runs.loading')}
          </p>
        ) : error ? (
          <p className="empty-note" role="alert">
            {error instanceof Error ? error.message : t('error.fallback.cannot-load-workflow-runs')}
          </p>
        ) : runs.length ? (
          runs.map((run) => (
            <div className={styles.runRow} key={run.id}>
              <Badge variant={runBadgeVariant(run.status)}>
                {t(`workflows.runs.status.${run.status}`)}
              </Badge>
              <div>
                <small>{absolute(run.createdAt)}</small>
                {run.status === 'FAILED' && run.failureReason ? (
                  <small>
                    {t('workflows.runs.failedAt', {
                      index: run.failedStepIndex ?? 0,
                      reason: run.failureReason,
                    })}
                  </small>
                ) : null}
              </div>
              {run.depth > 0 ? (
                <small>{t('workflows.runs.depth', { depth: run.depth })}</small>
              ) : null}
            </div>
          ))
        ) : (
          <p className="empty-note">{t('workflows.runs.empty')}</p>
        )}
      </div>
      <footer className={styles.formFooter}>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('workflows.action.close')}
        </Button>
      </footer>
    </section>
  );
}

function runBadgeVariant(status: WorkflowRunView['status']) {
  if (status === 'SUCCEEDED') return 'success' as const;
  if (status === 'FAILED') return 'danger' as const;
  return 'neutral' as const;
}
