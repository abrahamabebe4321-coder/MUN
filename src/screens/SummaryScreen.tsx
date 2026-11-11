import { Button } from '../components/ui/Button';
import { useCommittee } from '../state/CommitteeContext';

export function SummaryScreen() {
  const { dispatch } = useCommittee();
  return (
    <main className="summary">
      <h1>Conference summary</h1>
      <Button onClick={() => dispatch({ type: 'committee/setStage', stage: 'running' })}>
        Reopen committee
      </Button>
    </main>
  );
}
