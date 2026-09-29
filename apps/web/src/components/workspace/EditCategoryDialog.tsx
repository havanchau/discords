import { useState, type FormEvent } from 'react';
import type { ChannelCategory } from '@/api';
import { useTranslation } from '@/i18n/LocaleProvider';
import { Button, DialogContent, DialogRoot, TextField } from '@/components/ui';
import styles from './WorkspaceDialogs.module.css';
import { formText } from '@/utils/formText';

interface EditCategoryDialogProps {
  category: ChannelCategory | null;
  pendingAction: string | null;
  onClose: () => void;
  onSave: (categoryId: string, changes: { name: string }) => Promise<boolean>;
  onDelete: (categoryId: string) => Promise<boolean>;
}

export function EditCategoryDialog({
  category,
  pendingAction,
  onClose,
  onSave,
  onDelete,
}: EditCategoryDialogProps) {
  const t = useTranslation();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const isPending = Boolean(category && pendingAction === `category-${category.id}`);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!category) return;
    const form = new FormData(event.currentTarget);
    const saved = await onSave(category.id, { name: formText(form, 'name').trim() });
    if (saved) close();
  }

  function close() {
    setIsConfirmingDelete(false);
    onClose();
  }

  async function confirmDelete() {
    if (!category) return;
    const deleted = await onDelete(category.id);
    if (deleted) close();
  }

  return (
    <DialogRoot
      open={Boolean(category)}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent title={t('category.edit.title')}>
        {category ? (
          <form key={category.id} onSubmit={(event) => void submit(event)} className={styles.form}>
            <TextField
              name="name"
              label={t('category.field.name')}
              defaultValue={category.name}
              maxLength={80}
              required
            />
            <Button type="submit" fullWidth disabled={isPending}>
              {t('category.action.save')}
            </Button>
            {isConfirmingDelete ? (
              <Button
                type="button"
                variant="danger"
                fullWidth
                disabled={isPending}
                onClick={() => void confirmDelete()}
              >
                {t('category.action.confirmDelete')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                fullWidth
                onClick={() => setIsConfirmingDelete(true)}
              >
                {t('category.action.delete')}
              </Button>
            )}
          </form>
        ) : null}
      </DialogContent>
    </DialogRoot>
  );
}
