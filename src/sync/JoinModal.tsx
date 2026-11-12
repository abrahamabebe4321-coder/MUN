import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';

export function JoinModal({
  name,
  onJoin,
  onCancel,
}: {
  name: string;
  onJoin: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title="Join shared committee"
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={onJoin}>
            Join
          </Button>
        </>
      }
    >
      <p>
        {`Join the shared committee “${name}”? It replaces the committee on this laptop. Download a backup first if you want to keep it.`}
      </p>
    </Modal>
  );
}
