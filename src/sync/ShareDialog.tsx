import { useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import type { SyncApi } from './useLiveSync';

export function statusLabel(sync: Pick<SyncApi, 'status' | 'others'>): string | null {
  if (sync.status === 'connected') return sync.others > 0 ? `Live, ${sync.others} other${sync.others === 1 ? '' : 's'}` : 'Live';
  if (sync.status === 'connecting') return 'Connecting…';
  if (sync.status === 'reconnecting') return 'Reconnecting…';
  if (sync.status === 'error') return 'Connection problem';
  return null;
}

export function ShareDialog({ sync, onClose }: { sync: SyncApi; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const copy = async () => {
    input.current?.select();
    try {
      await navigator.clipboard.writeText(sync.shareUrl ?? '');
      setCopied(true);
    } catch {
      setCopied(false); // text stays selected so Ctrl+C works
    }
  };

  const n = sync.others;
  return (
    <Modal title="Share with your co-chair" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      <p>Anyone with this link can see and edit this committee live. Send it only to your co-chair.</p>
      {sync.shareUrl ? (
        <>
          <div className="share-row">
            <input
              ref={input}
              className="share-link"
              readOnly
              aria-label="Share link"
              value={sync.shareUrl}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button variant="primary" onClick={() => void copy()}>
              Copy link
            </Button>
            <span className="share-copied" role="status">
              {copied ? 'Copied' : ''}
            </span>
          </div>
          <p className="share-status">
            {`Status: ${statusLabel(sync) ?? 'Off'}. `}
            {n === 0 ? 'Only you are editing.' : `You and ${n} other${n === 1 ? '' : 's'} are editing.`}
          </p>
          <Button
            variant="danger"
            className="share-stop"
            onClick={() => {
              sync.stopSharing();
              onClose();
            }}
          >
            Stop sharing on this laptop
          </Button>
        </>
      ) : (
        <Button variant="primary" onClick={() => sync.startSharing()}>
          Create share link
        </Button>
      )}
    </Modal>
  );
}
