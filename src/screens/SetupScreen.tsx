import { useState } from 'react'
import { CommitteesDialog } from './CommitteesDialog'
import { listCommittees } from '../state/library'
import type { KeyboardEvent } from 'react'
import { Button } from '../components/ui/Button'
import { DelegateChip } from '../components/ui/DelegateChip'
import { Flag } from '../components/Flag'
import { COUNTRIES, searchCountries } from '../data/countries'
import { useCommittee } from '../state/CommitteeContext'
import type { Action } from '../state/reducer'
import './setup.css'

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

export function SetupScreen() {
  const { state, dispatch, cid } = useCommittee()
  const [switcher, setSwitcher] = useState(false)
  const [hasOthers] = useState(() => listCommittees().some((e) => e.id !== cid))
  const [query, setQuery] = useState('')
  const [custom, setCustom] = useState('')
  const [pasted, setPasted] = useState('')
  const [status, setStatus] = useState<{ added: number; unknown: string[] } | null>(null)

  const added = new Set(state.delegates.map((d) => d.id))
  const results = searchCountries(query)

  const addCountry = (c: { code: string; name: string }) =>
    dispatch({ type: 'delegate/add', id: c.code, name: c.name, flag: c.code })

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const first = results.find((c) => !added.has(c.code))
    if (first) {
      addCountry(first)
      setQuery('')
    }
  }

  const addCustom = () => {
    const name = custom.trim()
    if (!name) return
    const exists = state.delegates.some((d) => d.name.toLowerCase() === name.toLowerCase())
    if (!exists) dispatch({ type: 'delegate/add', name, flag: null })
    setCustom('')
  }

  const addFromList = () => {
    const entries = pasted
      .split(/[\n,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
    const actions: Action[] = []
    const unknown: string[] = []
    const seen = new Set<string>()
    for (const entry of entries) {
      const n = norm(entry)
      const match = COUNTRIES.find((c) => [c.name, ...(c.aliases ?? [])].some((t) => norm(t) === n))
      if (!match) {
        unknown.push(entry)
        continue
      }
      if (added.has(match.code) || seen.has(match.code)) continue
      seen.add(match.code)
      actions.push({ type: 'delegate/add', id: match.code, name: match.name, flag: match.code })
    }
    if (actions.length > 0) dispatch({ type: 'batch', actions })
    setPasted(unknown.join('\n'))
    setStatus({ added: actions.length, unknown })
  }

  const missing: string[] = []
  if (!state.name.trim()) missing.push('Enter a committee name')
  if (state.delegates.length < 2) missing.push('Add at least 2 delegations')
  const canStart = missing.length === 0

  const shownResults = query.trim() ? results.slice(0, 8) : []

  return (
    <main className="setup">
      <h1>Set up your committee</h1>
      {hasOthers && (
        <p className="setup-switch">
          <Button variant="ghost" size="sm" onClick={() => setSwitcher(true)}>
            Open another committee
          </Button>
        </p>
      )}
      {switcher && <CommitteesDialog onClose={() => setSwitcher(false)} />}
      <p className="muted setup-lede">Name the committee, add the delegations, then start.</p>
      <div className="setup-fields">
        <div className="field">
          <label htmlFor="setup-name">Committee name</label>
          <input
            id="setup-name"
            type="text"
            value={state.name}
            placeholder="e.g. General Assembly"
            onChange={(e) => dispatch({ type: 'committee/update', name: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="setup-topic">Topic</label>
          <input
            id="setup-topic"
            type="text"
            value={state.topic}
            placeholder="e.g. Reform of the veto"
            onChange={(e) => dispatch({ type: 'committee/update', topic: e.target.value })}
          />
        </div>
      </div>

      <section className="setup-section" aria-labelledby="setup-delegations">
        <div className="row setup-heading">
          <h2 id="setup-delegations">Delegations</h2>
          <span className="muted tabular">{`${state.delegates.length} added`}</span>
        </div>
        <input
          type="search"
          className="setup-search"
          aria-label="Search countries"
          placeholder="Search countries…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
        />
        {shownResults.length > 0 && (
          <ul className="setup-results">
            {shownResults.map((c) => {
              const isAdded = added.has(c.code)
              return (
                <li key={c.code}>
                  <button
                    type="button"
                    className="setup-result"
                    disabled={isAdded}
                    onClick={() => addCountry(c)}
                  >
                    <Flag code={c.code} />
                    <span className="grow">{c.name}</span>
                    {isAdded && <span className="badge">Added</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {state.delegates.length === 0 ? (
          <p className="muted">No delegations yet. Search for a country above.</p>
        ) : (
          <ul className="setup-chips">
            {state.delegates.map((d) => (
              <li key={d.id} className="setup-chip">
                <DelegateChip delegate={d} />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${d.name}`}
                  onClick={() => dispatch({ type: 'delegate/remove', id: d.id })}
                >
                  ✕
                </Button>
              </li>
            ))}
          </ul>
        )}

        <details className="setup-more">
          <summary>More ways to add</summary>
          <div className="setup-more-body">
            <div className="field">
              <label htmlFor="setup-custom">Add custom delegation</label>
              <div className="row">
                <input
                  id="setup-custom"
                  type="text"
                  className="grow"
                  aria-label="Custom delegation name"
                  placeholder="e.g. African Union"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addCustom()
                    }
                  }}
                />
                <Button onClick={addCustom}>Add</Button>
              </div>
            </div>
            <div className="field">
              <span className="setup-caption">Paste a list of countries</span>
              <textarea
                className="setup-textarea"
                aria-label="Country list"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
              />
              <div className="row">
                <Button onClick={addFromList}>Add from list</Button>
                {status && (
                  <p role="status" className="muted setup-status">
                    Added {status.added} delegation(s).
                    {status.unknown.length > 0 && ` Not recognised: ${status.unknown.join(', ')}`}
                  </p>
                )}
              </div>
            </div>
          </div>
        </details>
      </section>

      <footer className="setup-footer">
        <Button
          variant="primary"
          size="lg"
          disabled={!canStart}
          onClick={() => dispatch({ type: 'committee/setStage', stage: 'running' })}
        >
          Start committee
        </Button>
        {!canStart && <span className="muted">{missing.join(', ')}</span>}
      </footer>
    </main>
  )
}
