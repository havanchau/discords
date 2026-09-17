import { FileArchive, FileAudio2, FileText } from 'lucide-react';
import { assetUrl, MessageAttachment } from '@/api';
import { attachmentKind, formatBytes } from '@/helpers';
import { useTranslation } from '@/i18n/LocaleProvider';
import { Button } from '@/components/ui';
import type { PreviewAttachment } from './AttachmentPreviewDialog';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import styles from './MessageAttachments.module.css';

/** Attachment list shared by channel and direct message rows. */
export function MessageAttachments({
  attachments,
  onPreview,
}: {
  attachments: MessageAttachment[];
  onPreview: (attachment: PreviewAttachment) => void;
}) {
  const t = useTranslation();

  if (!attachments.length) return null;

  return (
    <div className={styles.attachmentGrid}>
      {attachments.map((attachment) => {
        const kind = attachmentKind(attachment);
        const url = assetUrl(attachment.url);

        if (kind === 'image') {
          return (
            <button
              type="button"
              key={attachment.id ?? attachment.url}
              className={`${styles.attachment} ${styles.imageAttachment}`}
              onClick={() => onPreview({ url, fileName: attachment.fileName, kind: 'image' })}
            >
              <img src={url} alt={attachment.fileName} />
            </button>
          );
        }

        if (kind === 'video') {
          return (
            <div
              key={attachment.id ?? attachment.url}
              className={`${styles.attachment} ${styles.videoAttachment}`}
            >
              <video src={url} controls preload="metadata" />
              <span>
                {attachment.fileName}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onPreview({ url, fileName: attachment.fileName, kind: 'video' })}
                >
                  {t('attachment.openPreview')}
                </Button>
              </span>
            </div>
          );
        }

        if (kind === 'voice' && attachment.durationMs && attachment.waveform) {
          return (
            <VoiceMessagePlayer
              key={attachment.id ?? attachment.url}
              url={url}
              durationMs={attachment.durationMs}
              waveform={attachment.waveform}
            />
          );
        }

        if (kind === 'audio') {
          return (
            <div
              key={attachment.id ?? attachment.url}
              className={`${styles.attachment} ${styles.audioAttachment}`}
            >
              <div className={styles.audioAttachmentHeader}>
                <FileAudio2 size={18} aria-hidden="true" />
                <span>
                  <strong>{attachment.fileName}</strong>
                  <small>{formatBytes(attachment.byteSize)}</small>
                </span>
              </div>
              <div className={styles.audioWaveform} aria-hidden="true">
                {Array.from({ length: 18 }, (_, index) => (
                  <i key={index} />
                ))}
              </div>
              <audio src={url} controls preload="metadata" />
            </div>
          );
        }

        const Icon = kind === 'archive' ? FileArchive : FileText;
        return (
          <a
            key={attachment.id ?? attachment.url}
            className={styles.fileAttachment}
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            <Icon size={22} aria-hidden="true" />
            <span>
              <strong>{attachment.fileName}</strong>
              <small>{formatBytes(attachment.byteSize)}</small>
            </span>
          </a>
        );
      })}
    </div>
  );
}
