import { useState, type FormEvent } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import {
  WORKFLOW_MAX_STEPS,
  workflowActionTypes,
  workflowTriggerTypes,
} from '@discord-clone/shared';
import type { CreateWorkflowInput, ServerDetail, WorkflowView } from '@/api';
import { Button, IconButton, TextArea, TextField } from '@/components/ui';
import { useTranslation } from '@/i18n/LocaleProvider';
import {
  draftFromWorkflow,
  emptyStepDraft,
  inputFromDraft,
  type WorkflowStepDraft,
} from '@/utils/workflowDraft';
import { SettingsSelect } from './SettingsSelect';
import styles from './WorkflowsSection.module.css';

interface WorkflowFormProps {
  server: ServerDetail;
  /** Null creates a new workflow. */
  workflow: WorkflowView | null;
  isSaving: boolean;
  onSubmit: (input: CreateWorkflowInput) => Promise<void>;
  onCancel: () => void;
}

export function WorkflowForm({
  server,
  workflow,
  isSaving,
  onSubmit,
  onCancel,
}: WorkflowFormProps) {
  const t = useTranslation();
  const [draft, setDraft] = useState(() => draftFromWorkflow(workflow));
  const textChannels = server.channels.filter((channel) => channel.type === 'TEXT');
  const update = (patch: Partial<typeof draft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  function updateStep(index: number, patch: Partial<WorkflowStepDraft>) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    }));
  }

  function addStep() {
    setDraft((current) => ({ ...current, steps: [...current.steps, emptyStepDraft()] }));
  }

  function removeStep(index: number) {
    setDraft((current) => ({ ...current, steps: current.steps.filter((_, i) => i !== index) }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit(inputFromDraft(draft));
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-labelledby="workflow-form-title">
      <strong id="workflow-form-title">
        {t(workflow ? 'workflows.form.editTitle' : 'workflows.form.createTitle')}
      </strong>
      <TextField
        label={t('workflows.field.name')}
        value={draft.name}
        maxLength={100}
        required
        onChange={(event) => update({ name: event.target.value })}
      />

      <SettingsSelect
        name="triggerType"
        label={t('workflows.field.trigger')}
        defaultValue={draft.triggerType}
        options={workflowTriggerTypes.map((value) => ({
          value,
          label: t(`workflows.trigger.${value}`),
        }))}
        onValueChange={(triggerType) => update({ triggerType })}
      />

      {draft.triggerType === 'MESSAGE_MATCHES' ? (
        <>
          <SettingsSelect
            name="channelId"
            label={t('workflows.field.channel')}
            defaultValue={draft.channelId}
            options={textChannels.map((channel) => ({
              value: channel.id,
              label: `#${channel.name}`,
            }))}
            onValueChange={(channelId) => update({ channelId })}
          />
          <TextArea
            label={t('workflows.field.terms')}
            hint={t('workflows.field.termsHint')}
            value={draft.termsText}
            rows={3}
            required
            onChange={(event) => update({ termsText: event.target.value })}
          />
        </>
      ) : null}

      {draft.triggerType === 'SCHEDULE' ? (
        <TextField
          label={t('workflows.field.intervalMinutes')}
          hint={t('workflows.field.intervalMinutesHint')}
          type="number"
          min={60}
          max={10_080}
          value={draft.intervalMinutes}
          required
          onChange={(event) => update({ intervalMinutes: event.target.value })}
        />
      ) : null}

      <fieldset className={styles.checkGroup}>
        <legend>{t('workflows.field.steps')}</legend>
        {draft.steps.map((step, index) => (
          <div className={styles.stepCard} key={index}>
            <div className={styles.stepHeader}>
              <SettingsSelect
                name={`step-${index}-actionType`}
                label={t('workflows.field.stepAction')}
                defaultValue={step.actionType}
                options={workflowActionTypes.map((value) => ({
                  value,
                  label: t(`workflows.stepAction.${value}`),
                }))}
                onValueChange={(actionType) => updateStep(index, { actionType })}
              />
              {draft.steps.length > 1 ? (
                <IconButton
                  label={t('workflows.action.removeStep', { position: index + 1 })}
                  variant="danger"
                  size="sm"
                  onClick={() => removeStep(index)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </IconButton>
              ) : null}
            </div>

            {step.actionType === 'POST_MESSAGE' ? (
              <>
                <SettingsSelect
                  name={`step-${index}-channelId`}
                  label={t('workflows.field.stepChannel')}
                  defaultValue={step.channelId}
                  options={textChannels.map((channel) => ({
                    value: channel.id,
                    label: `#${channel.name}`,
                  }))}
                  onValueChange={(channelId) => updateStep(index, { channelId })}
                />
                <TextArea
                  label={t('workflows.field.content')}
                  value={step.content}
                  rows={2}
                  maxLength={2000}
                  required
                  onChange={(event) => updateStep(index, { content: event.target.value })}
                />
              </>
            ) : (
              <>
                <TextField
                  label={t('workflows.field.url')}
                  value={step.url}
                  maxLength={2048}
                  required
                  onChange={(event) => updateStep(index, { url: event.target.value })}
                />
                <SettingsSelect
                  name={`step-${index}-method`}
                  label={t('workflows.field.method')}
                  defaultValue={step.method}
                  options={[
                    { value: 'GET', label: 'GET' },
                    { value: 'POST', label: 'POST' },
                  ]}
                  onValueChange={(method) => updateStep(index, { method })}
                />
                <TextArea
                  label={t('workflows.field.body')}
                  value={step.body}
                  rows={2}
                  onChange={(event) => updateStep(index, { body: event.target.value })}
                />
                <TextField
                  label={t('workflows.field.secretHeaderName')}
                  value={step.secretHeaderName}
                  maxLength={100}
                  onChange={(event) => updateStep(index, { secretHeaderName: event.target.value })}
                />
                <TextField
                  label={t('workflows.field.secretHeaderValue')}
                  hint={
                    step.keepExistingSecret
                      ? t('workflows.field.keepExistingSecret')
                      : t('workflows.field.secretHeaderHint')
                  }
                  type="password"
                  value={step.secretHeaderValue}
                  maxLength={4096}
                  onChange={(event) =>
                    updateStep(index, {
                      secretHeaderValue: event.target.value,
                      keepExistingSecret: event.target.value ? false : step.keepExistingSecret,
                    })
                  }
                />
              </>
            )}
          </div>
        ))}
        {draft.steps.length < WORKFLOW_MAX_STEPS ? (
          <Button type="button" variant="secondary" onClick={addStep}>
            <Plus size={16} aria-hidden="true" />
            {t('workflows.action.addStep')}
          </Button>
        ) : null}
      </fieldset>

      <footer className={styles.formFooter}>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? <Loader2 className="spin" size={16} aria-hidden="true" /> : null}
          {t('workflows.form.save')}
        </Button>
      </footer>
    </form>
  );
}
