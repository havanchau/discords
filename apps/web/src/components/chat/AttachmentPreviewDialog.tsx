import { DialogContent, DialogRoot } from '../ui';
import styles from './AttachmentPreviewDialog.module.css';

interface PreviewAttachment {
  url: string;
  fileName: string;
  kind: 'image' | 'video';
}

interface AttachmentPreviewDialogProps {
  previewAttachment: PreviewAttachment | null;
  onClose: () => void;
}

export function AttachmentPreviewDialog({
  previewAttachment,
  onClose,
}: AttachmentPreviewDialogProps) {
  return (
    <DialogRoot open={Boolean(previewAttachment)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={previewAttachment?.fileName ?? 'Media Preview'}
        className={styles.dialogContent}
      >
        <div className={styles.mediaContainer}>
          {previewAttachment?.kind === 'image' && (
            <img src={previewAttachment.url} alt={previewAttachment.fileName} className={styles.media} />
          )}
          {previewAttachment?.kind === 'video' && (
            <video src={previewAttachment.url} controls autoPlay className={styles.media} />
          )}
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
export type { PreviewAttachment };
