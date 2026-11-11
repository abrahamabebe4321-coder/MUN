import { useEffect, useState } from 'react';
import { CommitteeProvider, useCommittee } from './state/CommitteeContext';
import { SetupScreen } from './screens/SetupScreen';
import { ChairLayout } from './screens/ChairLayout';
import { SummaryScreen } from './screens/SummaryScreen';
import { ProjectorView } from './screens/ProjectorView';

export function ChairApp() {
  const { state } = useCommittee();
  if (state.stage === 'setup') return <SetupScreen />;
  if (state.stage === 'ended') return <SummaryScreen />;
  return <ChairLayout />;
}

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (hash === '#/projector') return <ProjectorView />;
  return (
    <CommitteeProvider>
      <ChairApp />
    </CommitteeProvider>
  );
}
