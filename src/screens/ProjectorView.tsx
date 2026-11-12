import { useEffect, useRef, useState } from 'react';
import { useStoredCommittee } from '../state/CommitteeContext';
import type { CommitteeState } from '../state/state';
import { useNow } from '../hooks/useNow';
import { describeMotion, orderMotions } from '../domain/motions';
import { TimerDisplay } from '../components/ui/TimerDisplay';
import { Flag } from '../components/Flag';
import { getProjectorScreen } from '../projectorScreen';
import type { ScreenDetailed } from '../projectorScreen';
import { applyStoredTheme, THEME_KEY } from '../theme';
import './projector.css';

const MODE_LABELS = {
  none: 'Debate paused',
  opening: 'Opening speeches',
  gsl: 'General speakers list',
  mod: 'Moderated caucus',
  unmod: 'Unmoderated caucus',
  resolution: 'Resolution debate',
} as const;

const MAX_QUEUE = 6;
const MAX_POIS = 6;
const MAX_MOTIONS = 4;
const VOTE_BANNER_MS = 30_000;

const NOTE_MS = 4000;
const FS_HINT = 'Press Esc to leave fullscreen';

const BLOCKED_MSG = 'Fullscreen was blocked. Click Fullscreen again.';

function FullscreenButton() {
  const [full, setFull] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  const [message, setMessage] = useState<string | null>(null);
  const screenRef = useRef<ScreenDetailed | null>(null);
  useEffect(() => {
    let alive = true;
    void getProjectorScreen().then((s) => {
      if (alive) screenRef.current = s;
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  useEffect(() => {
    if (full) setMessage(FS_HINT);
    else setMessage((m) => (m === FS_HINT ? null : m));
  }, [full]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), NOTE_MS);
    return () => clearTimeout(t);
  }, [message]);

  // Must stay synchronous up to requestFullscreen to keep the user activation.
  const toggle = () => {
    try {
      if (document.fullscreenElement) {
        void document.exitFullscreen?.()?.catch?.(() => {});
        return;
      }
      const root = document.documentElement;
      const s = screenRef.current;
      const first = s
        ? root.requestFullscreen({ screen: s } as unknown as FullscreenOptions)
        : root.requestFullscreen();
      Promise.resolve(first).catch(() => {
        if (!s) throw new Error('blocked');
        return root.requestFullscreen();
      }).catch(() => setMessage(BLOCKED_MSG));
    } catch {
      setMessage(BLOCKED_MSG);
    }
  };

  return (
    <>
      <button type="button" className="proj-fullscreen" title={FS_HINT} onClick={toggle}>
        {full ? 'Exit fullscreen' : 'Fullscreen'}
      </button>
      {message && (
        <div role="status" className="proj-fs-note">
          {message}
        </div>
      )}
    </>
  );
}

function Content({ state, now }: { state: CommitteeState; now: number }) {
  const { debate } = state;
  const byId = new Map(state.delegates.map((d) => [d.id, d]));
  const header = (
    <header className="proj-header">
      <h2 className="proj-name">{state.name}</h2>
      {state.topic && <div className="proj-topic" title={state.topic}>{state.topic}</div>}
      <div className="proj-session">{`Session ${state.session}`}</div>
    </header>
  );

  if (state.stage === 'ended') {
    return (
      <>
        {header}
        <div className="proj-ended">
          <div className="proj-mode">The conference has ended</div>
        </div>
      </>
    );
  }

  const speaker = debate.currentSpeakerId ? byId.get(debate.currentSpeakerId) : undefined;
  const queue = debate.speakersList.flatMap((id) => {
    const d = byId.get(id);
    return d ? [d] : [];
  });
  const shown = queue.slice(0, MAX_QUEUE);
  const more = queue.length - shown.length;
  const poiQueue = (debate.poiQueue ?? []).flatMap((id) => {
    const d = byId.get(id);
    return d ? [d] : [];
  });
  const shownPois = poiQueue.slice(0, MAX_POIS);
  const morePois = poiQueue.length - shownPois.length;
  const motions = orderMotions(state.motions);
  const shownMotions = motions.slice(0, MAX_MOTIONS);
  const moreMotions = motions.length - shownMotions.length;
  const lastVote = state.votes[state.votes.length - 1];
  const showVote = lastVote !== undefined && now - lastVote.timestamp < VOTE_BANNER_MS;

  return (
    <>
      {header}
      <div className="proj-mode">{MODE_LABELS[debate.mode]}</div>
      {debate.mode === 'mod' && debate.topic && <div className="proj-mod-topic">{debate.topic}</div>}
      {debate.mode === 'unmod' && debate.caucusTimer ? (
        <div className="proj-unmod">
          <TimerDisplay timer={debate.caucusTimer} now={now} size="xl" label="Time remaining" />
        </div>
      ) : debate.mode !== 'unmod' ? (
        <div className="proj-layout">
          <div className="proj-main">
            {speaker ? (
              <div className="proj-speaker">
                <Flag code={speaker.flag} size={72} />
                <span className="proj-speaker-name">{speaker.name}</span>
              </div>
            ) : (
              <div className="proj-none">No speaker</div>
            )}
            <TimerDisplay timer={debate.speechTimer} now={now} size="xl" label="Speaking time" />
            {shownPois.length > 0 && (
              <div className="proj-pois">
                <span className="proj-pois-title">Points of information</span>
                {shownPois.map((d) => (
                  <span key={d.id} className="proj-poi">
                    <Flag code={d.flag} size={32} />
                    <span>{d.name}</span>
                  </span>
                ))}
                {morePois > 0 && <span className="proj-more">{`+${morePois} more`}</span>}
              </div>
            )}
          </div>
          <aside className="proj-side">
            <h2>Next speakers</h2>
            {shown.length > 0 ? (
              <ol className="proj-queue">
                {shown.map((d, i) => (
                  <li key={`${d.id}-${i}`}>
                    <span className="proj-queue-item">
                      <Flag code={d.flag} size={32} />
                      <span>{d.name}</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="proj-empty">Speakers list is empty</div>
            )}
            {more > 0 && <div className="proj-more">{`+${more} more`}</div>}
          </aside>
        </div>
      ) : null}
      {motions.length > 0 && (
        <section className="proj-motions">
          <h2>Motions on the floor</h2>
          <ol>
            {shownMotions.map((m) => (
              <li key={m.id}>
                {describeMotion(m)}, proposed by {byId.get(m.proposerId)?.name ?? ''}
              </li>
            ))}
          </ol>
          {moreMotions > 0 && <div className="proj-more">{`+${moreMotions} more`}</div>}
        </section>
      )}
      {showVote && (
        <div role="status" className={`proj-vote ${lastVote.passed ? 'is-passed' : 'is-failed'}`}>
          <div className="proj-vote-subject">{lastVote.subject}</div>
          <div className="proj-vote-result">{lastVote.passed ? 'PASSED' : 'FAILED'}</div>
          <div className="proj-vote-counts">{`For ${lastVote.for}, against ${lastVote.against}, abstain ${lastVote.abstain}`}</div>
        </div>
      )}
    </>
  );
}

export function ProjectorView() {
  const state = useStoredCommittee();
  const now = useNow(true, 250);
  useEffect(() => {
    applyStoredTheme();
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY || e.key === null) applyStoredTheme();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return (
    <main className="projector">
      <h1 className="sr-only">Projector view</h1>
      <FullscreenButton />
      {state === null || state.stage === 'setup' ? (
        <div className="proj-waiting">Waiting for the chair to start the committee…</div>
      ) : (
        <Content state={state} now={now} />
      )}
    </main>
  );
}
