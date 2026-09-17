import { useState, type FormEvent } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { DISCOVERY_QUERY_MAX_LENGTH } from '@discord-clone/shared';
import type { DiscoveryServerCard as DiscoveryCard } from '@/api';
import { Button, DialogContent, DialogRoot, IconButton, TextField } from '@/components/ui';
import { useDiscoveryDirectory } from '@/hooks/useServerDiscovery';
import { useTranslation } from '@/i18n/LocaleProvider';
import { DiscoveryServerCard } from './DiscoveryServerCard';
import { ReportServerDialog } from './ReportServerDialog';
import styles from './Discovery.module.css';

interface DiscoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Servers the viewer already belongs to show "Open" instead of "Join". */
  memberServerIds: ReadonlySet<string>;
  openServer: (serverId: string) => Promise<void>;
}

/** Browse and search the public server directory, and join a server from it. */
export function DiscoveryDialog({
  open,
  onOpenChange,
  memberServerIds,
  openServer,
}: DiscoveryDialogProps) {
  const t = useTranslation();

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={styles.dialog}
        title={t('discovery.title')}
        description={t('discovery.description')}
      >
        {open ? (
          <DiscoveryBrowser
            memberServerIds={memberServerIds}
            onOpenServer={async (serverId) => {
              await openServer(serverId);
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </DialogRoot>
  );
}

interface DiscoveryBrowserProps {
  memberServerIds: ReadonlySet<string>;
  onOpenServer: (serverId: string) => Promise<void>;
}

function DiscoveryBrowser({ memberServerIds, onOpenServer }: DiscoveryBrowserProps) {
  const t = useTranslation();
  const [draft, setDraft] = useState('');
  const [searchText, setSearchText] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [reporting, setReporting] = useState<DiscoveryCard | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const directory = useDiscoveryDirectory(searchText, tag);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchText(draft.trim());
  }

  async function join(server: DiscoveryCard) {
    setActionError(null);
    try {
      const result = await directory.joinServer(server.id);
      await onOpenServer(result.serverId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('error.fallback.cannot-join-server'));
    }
  }

  async function loadMore() {
    setActionError(null);
    try {
      await directory.fetchNextPage();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : t('error.fallback.cannot-load-discovery'),
      );
    }
  }

  return (
    <div className={styles.browser}>
      <form className={styles.searchRow} role="search" onSubmit={submitSearch}>
        <TextField
          aria-label={t('discovery.search')}
          placeholder={t('discovery.searchPlaceholder')}
          value={draft}
          maxLength={DISCOVERY_QUERY_MAX_LENGTH}
          leadingIcon={<Search size={16} aria-hidden="true" />}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" variant="secondary">
          {t('discovery.search')}
        </Button>
      </form>
      {tag ? (
        <div className={styles.activeTag} role="status">
          <span>{t('discovery.tagFilter', { tag })}</span>
          <IconButton
            size="sm"
            label={t('discovery.clearTag', { tag })}
            onClick={() => setTag(null)}
          >
            <X size={14} aria-hidden="true" />
          </IconButton>
        </div>
      ) : null}
      {actionError ? (
        <p className={styles.error} role="alert">
          {actionError}
        </p>
      ) : null}
      <div className={styles.results}>
        {directory.isLoading ? (
          <p className="empty-note" role="status">
            <Loader2 className="spin" size={14} aria-hidden="true" /> {t('discovery.loading')}
          </p>
        ) : directory.error ? (
          <p className="empty-note" role="alert">
            {directory.error instanceof Error
              ? directory.error.message
              : t('error.fallback.cannot-load-discovery')}
          </p>
        ) : directory.servers.length ? (
          directory.servers.map((server) => (
            <DiscoveryServerCard
              key={server.id}
              server={server}
              isMember={memberServerIds.has(server.id)}
              isJoining={directory.joiningId === server.id}
              onJoin={() => void join(server)}
              onOpen={() => void onOpenServer(server.id)}
              onSelectTag={setTag}
              onReport={() => setReporting(server)}
            />
          ))
        ) : (
          <p className="empty-note">{t('discovery.empty')}</p>
        )}
        {directory.hasNextPage ? (
          <Button
            variant="secondary"
            fullWidth
            disabled={directory.isFetchingNextPage}
            onClick={() => void loadMore()}
          >
            {directory.isFetchingNextPage ? (
              <Loader2 className="spin" size={16} aria-hidden="true" />
            ) : null}
            {t('discovery.loadMore')}
          </Button>
        ) : null}
      </div>
      {reporting ? (
        <ReportServerDialog
          server={reporting}
          onOpenChange={(isOpen) => !isOpen && setReporting(null)}
        />
      ) : null}
    </div>
  );
}
