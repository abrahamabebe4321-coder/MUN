import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useCommittee } from '../state/CommitteeContext';
import { createEntry, deleteCommittee, listCommittees } from '../state/library';
import type { CommitteeEntry } from '../state/library';
import './committees.css';

const label = (e: CommitteeEntry) => e.name.trim() || 'Untitled committee';

export function CommitteesDialog({ onClose }: { onClose: () => void }) {
  const { cid, switchTo } = useCommittee();
  const [entries, setEntries] = useState<CommitteeEntry[]>(() => listCommittees());
  const [deleting, setDeleting] = useState<string | null>(null);

  const open = (id: string) => {
    onClose();
    switchTo(id);
  };

  return (
    <Modal
      title="Committees"
      onClose={onClose}
      wide
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <div className="committees-top">
        <p className="committees-lede">Each committee is saved separately on this laptop.</p>
        <Button
          variant="primary"
          onClick={() => {
            const id = createEntry();
            open(id);
          }}
        >
          New committee
        </Button>
      </div>
      <ul className="committees-list">
        {entries.map((e) => {
          const current = e.id === cid;
          return (
            <li key={e.id} className="committees-row">
              <div className="committees-main">
                <div className="committees-name">
                  <span>{label(e)}</span>
                  {e.roomId && <span className="committees-tag">Shared</span>}
                </div>
                {e.topic && <div className="committees-muted">{e.topic}</div>}
                <div className="committees-muted">{`Last edited ${new Date(e.updatedAt).toLocaleString()}`}</div>
                {deleting === e.id && (
                  <div className="committees-confirm" role="alert">
                    <p>
                      {`Delete ${label(e)} from this laptop? This can't be undone.`}
                      {e.roomId ? ' Your co-chair keeps their copy.' : ''}
                    </p>
                    <div className="committees-actions">
                      <Button
                        variant="danger"
                        className="btn-solid"
                        onClick={() => {
                          deleteCommittee(e.id);
                          setEntries(listCommittees());
                          setDeleting(null);
                        }}
                      >
                        Delete
                      </Button>
                      <Button onClick={() => setDeleting(null)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="committees-actions">
                {current ? (
                  <span className="committees-now">Open now</span>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="committees-open"
                      aria-label={`Open ${label(e)}`}
                      onClick={() => open(e.id)}
                    >
                      Open
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="committees-delete"
                      aria-label={`Delete ${label(e)}`}
                      onClick={() => setDeleting(e.id)}
                    >
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
