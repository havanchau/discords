import { useState, type FormEvent } from 'react';
import type { ChannelCategory } from '../../api';
import { Button, DialogContent, DialogRoot, TextField } from '../ui';
import styles from './WorkspaceDialogs.module.css';

interface EditCategoryDialogProps {
  category: ChannelCategory | null;
  pendingAction: string | null;
  onClose: () => void;
  onSave: (categoryId: string, changes: { name: string; position: number }) => Promise<boolean>;
  onDelete: (categoryId: string) => Promise<boolean>;
}

export function EditCategoryDialog({
  category,
  pendingAction,
  onClose,
  onSave,
  onDelete,
}: EditCategoryDialogProps) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const isPending = Boolean(category && pendingAction === `category-${category.id}`);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!category) return;
    const form = new FormData(event.currentTarget);
    const positionValue = String(form.get('position') ?? '').trim();
    const saved = await onSave(category.id, {
      name: String(form.get('name') ?? '').trim(),
      // An emptied field keeps the current position instead of becoming 0.
      position: positionValue ? Number(positionValue) : category.position,
    });
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
      <DialogContent title="Edit category">
        {category ? (
          <form key={category.id} onSubmit={submit} className={styles.form}>
            <TextField
              name="name"
              label="Category name"
              defaultValue={category.name}
              maxLength={80}
              required
            />
            <TextField
              name="position"
              label="Position"
              type="number"
              min={0}
              defaultValue={category.position}
            />
            <Button type="submit" fullWidth disabled={isPending}>
              Save category
            </Button>
            {isConfirmingDelete ? (
              <Button
                type="button"
                variant="danger"
                fullWidth
                disabled={isPending}
                onClick={() => void confirmDelete()}
              >
                Confirm delete — channels stay, uncategorized
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                fullWidth
                onClick={() => setIsConfirmingDelete(true)}
              >
                Delete category
              </Button>
            )}
          </form>
        ) : null}
      </DialogContent>
    </DialogRoot>
  );
}
