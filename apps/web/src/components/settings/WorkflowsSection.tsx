import { useState } from 'react';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { WORKFLOW_MAX_PER_SERVER } from '@discord-clone/shared';
import type { CreateWorkflowInput, CreateWorkflowResult, ServerDetail, WorkflowView } from '@/api';
import { Badge, Button, IconButton, Switch, TextField } from '@/components/ui';
import { useWorkflows } from '@/hooks/useWorkflows';
import { useTranslation, type Translate } from '@/i18n/LocaleProvider';
import { WorkflowForm } from './WorkflowForm';
import { WorkflowRunHistory } from './WorkflowRunHistory';
import settingsStyles from '@/components/SettingsModal.module.css';
import styles from './WorkflowsSection.module.css';

interface WorkflowsSectionProps {
  server: ServerDetail;
}

/** The server's workflows and HTTP allowlist. Rendered only for MANAGE_SERVER holders. */
export function WorkflowsSection({ server }: WorkflowsSectionProps) {
  const t = useTranslation();
  const workflows = useWorkflows(server.id);
  const [editing, setEditing] = useState<WorkflowView | 'new' | null>(null);
  const [viewingRunsFor, setViewingRunsFor] = useState<WorkflowView | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [shownTriggerUrl, setShownTriggerUrl] = useState<string | null>(null);
  const [hostnameInput, setHostnameInput] = useState('');

  async function run(action: () => Promise<unknown>, fallback: string) {
    setActionError(null);
    try {
      return await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : fallback);
      return undefined;
    }
  }

  async function save(input: CreateWorkflowInput) {
    const target = editing;
    const result = await run(
      () =>
        target && target !== 'new'
          ? workflows.updateWorkflow({ workflowId: target.id, ...input })
          : workflows.createWorkflow(input),
      t('error.fallback.cannot-save-workflow'),
    );
    if (result) {
      setEditing(null);
      const created = result as CreateWorkflowResult;
      if (created.triggerUrl) setShownTriggerUrl(created.triggerUrl);
    }
  }

  return (
    <section className={settingsStyles.settingsSection} aria-labelledby="server-workflows-title">
      <div className={settingsStyles.settingsSectionHeading}>
        <strong id="server-workflows-title">
          {t('workflows.section.title', {
            count: workflows.workflows.length,
            max: WORKFLOW_MAX_PER_SERVER,
          })}
        </strong>
        <span>{t('workflows.section.hint')}</span>
      </div>
      {actionError ? (
        <p className="empty-note" role="alert">
          {actionError}
        </p>
      ) : null}
      {shownTriggerUrl ? (
        <p className="empty-note" role="status">
          {t('workflows.triggerUrl.shown', { url: shownTriggerUrl })}{' '}
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(shownTriggerUrl);
              setShownTriggerUrl(null);
            }}
          >
            {t('workflows.triggerUrl.copy')}
          </Button>
        </p>
      ) : null}

      {editing ? (
        <WorkflowForm
          key={editing === 'new' ? 'new' : editing.id}
          server={server}
          workflow={editing === 'new' ? null : editing}
          isSaving={workflows.isSaving}
          onSubmit={save}
          onCancel={() => {
            setActionError(null);
            setEditing(null);
          }}
        />
      ) : viewingRunsFor ? (
        <WorkflowRunHistory workflow={viewingRunsFor} onClose={() => setViewingRunsFor(null)} />
      ) : (
        <>
          <Button
            type="button"
            variant="secondary"
            disabled={workflows.workflows.length >= WORKFLOW_MAX_PER_SERVER}
            onClick={() => setEditing('new')}
          >
            <Plus size={16} aria-hidden="true" />
            {t('workflows.action.add')}
          </Button>
          <div className={settingsStyles.inviteList}>
            {workflows.isLoading ? (
              <p className="empty-note" role="status">
                <Loader2 className="spin" size={14} aria-hidden="true" /> {t('workflows.loading')}
              </p>
            ) : workflows.error ? (
              <p className="empty-note" role="alert">
                {workflows.error instanceof Error
                  ? workflows.error.message
                  : t('error.fallback.cannot-load-workflows')}
              </p>
            ) : workflows.workflows.length ? (
              workflows.workflows.map((workflow) => (
                <div className={styles.workflowRow} key={workflow.id}>
                  <div>
                    <strong>{workflow.name}</strong>
                    <small>{workflowSummary(workflow, server, t)}</small>
                  </div>
                  {workflow.channelMissing ? (
                    <Badge variant="danger">{t('workflows.channelMissing')}</Badge>
                  ) : null}
                  <Badge variant="neutral">{t(`workflows.trigger.${workflow.triggerType}`)}</Badge>
                  <Switch
                    checked={workflow.enabled}
                    disabled={workflows.pendingWorkflowId === workflow.id}
                    aria-label={t('workflows.action.toggle', { name: workflow.name })}
                    onCheckedChange={(enabled) =>
                      void run(
                        () => workflows.updateWorkflow({ workflowId: workflow.id, enabled }),
                        t('error.fallback.cannot-save-workflow'),
                      )
                    }
                  />
                  <Button type="button" variant="ghost" onClick={() => setViewingRunsFor(workflow)}>
                    {t('workflows.action.viewRuns', { name: workflow.name })}
                  </Button>
                  <IconButton
                    label={t('workflows.action.edit', { name: workflow.name })}
                    size="sm"
                    onClick={() => setEditing(workflow)}
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label={t('workflows.action.delete', { name: workflow.name })}
                    variant="danger"
                    size="sm"
                    disabled={workflows.pendingWorkflowId === workflow.id}
                    onClick={() =>
                      void run(
                        () => workflows.deleteWorkflow(workflow.id),
                        t('error.fallback.cannot-delete-workflow'),
                      )
                    }
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </IconButton>
                </div>
              ))
            ) : (
              <p className="empty-note">{t('workflows.empty')}</p>
            )}
          </div>

          <div className={settingsStyles.settingsSectionHeading}>
            <strong>{t('workflows.allowlist.title')}</strong>
            <span>{t('workflows.allowlist.hint')}</span>
          </div>
          <form
            className={settingsStyles.settingsGrid}
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await workflows.addAllowlistEntry({ hostname: hostnameInput.trim() });
                setHostnameInput('');
              }, t('error.fallback.cannot-save-workflow-allowlist-entry'));
            }}
          >
            <TextField
              label={t('workflows.allowlist.field.hostname')}
              value={hostnameInput}
              maxLength={253}
              required
              onChange={(event) => setHostnameInput(event.target.value)}
            />
            <Button type="submit" disabled={workflows.isSavingAllowlistEntry}>
              {t('workflows.allowlist.action.add')}
            </Button>
          </form>
          <div className={settingsStyles.inviteList}>
            {workflows.isLoadingAllowlist ? (
              <p className="empty-note" role="status">
                <Loader2 className="spin" size={14} aria-hidden="true" />{' '}
                {t('workflows.allowlist.loading')}
              </p>
            ) : workflows.allowlistError ? (
              <p className="empty-note" role="alert">
                {workflows.allowlistError instanceof Error
                  ? workflows.allowlistError.message
                  : t('error.fallback.cannot-load-workflow-allowlist')}
              </p>
            ) : workflows.allowlistEntries.length ? (
              workflows.allowlistEntries.map((entry) => (
                <div className={styles.allowlistRow} key={entry.id}>
                  <strong>{entry.hostname}</strong>
                  <IconButton
                    label={t('workflows.allowlist.action.remove', { hostname: entry.hostname })}
                    variant="danger"
                    size="sm"
                    disabled={workflows.pendingAllowlistEntryId === entry.id}
                    onClick={() =>
                      void run(
                        () => workflows.removeAllowlistEntry(entry.id),
                        t('error.fallback.cannot-delete-workflow-allowlist-entry'),
                      )
                    }
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </IconButton>
                </div>
              ))
            ) : (
              <p className="empty-note">{t('workflows.allowlist.empty')}</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function workflowSummary(workflow: WorkflowView, server: ServerDetail, t: Translate) {
  const config = workflow.triggerConfig as {
    terms?: string[];
    channelId?: string;
    intervalMinutes?: number;
  };
  switch (workflow.triggerType) {
    case 'MESSAGE_MATCHES': {
      const channel = server.channels.find((candidate) => candidate.id === config.channelId);
      return t('workflows.summary.MESSAGE_MATCHES', {
        count: config.terms?.length ?? 0,
        channel: channel?.name ?? config.channelId ?? '',
      });
    }
    case 'WEBHOOK_RECEIVED':
      return t('workflows.summary.WEBHOOK_RECEIVED');
    case 'SCHEDULE':
      return t('workflows.summary.SCHEDULE', { minutes: config.intervalMinutes ?? 0 });
  }
}
