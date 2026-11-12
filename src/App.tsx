import { useCallback, useEffect, useState } from 'react';
import { CommitteeProvider, useCommittee } from './state/CommitteeContext';
import { resolveActive, searchFor, setLastActive } from './state/library';
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

function urlFor(cid: string): string {
  return `${window.location.pathname}${searchFor(cid)}${window.location.hash}`;
}

/** Resolves which committee this tab shows from its own URL, and keeps the URL in step. */
function ChairRoot() {
  const [cid, setCid] = useState(() => resolveActive(window.location.search));

  useEffect(() => {
    setLastActive(cid);
    try {
      const url = urlFor(cid);
      if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        window.history.replaceState(window.history.state, '', url);
      }
    } catch {
      // history unavailable
    }
  }, [cid]);

  useEffect(() => {
    const onPop = () => setCid(resolveActive(window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const switchTo = useCallback((next: string) => {
    try {
      window.history.pushState(null, '', urlFor(next));
    } catch {
      // history unavailable
    }
    setCid(next);
  }, []);

  return (
    <CommitteeProvider key={cid} cid={cid} onSwitch={switchTo}>
      <ChairApp />
    </CommitteeProvider>
  );
}

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (hash === '#/projector') return <ProjectorView />;
  return <ChairRoot />;
}
