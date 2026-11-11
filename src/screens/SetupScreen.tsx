import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Button } from '../components/ui/Button'
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
  const { state, dispatch } = useCommittee()
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

  return (
    <main className="setup">
      <h1>Set up your committee</h1>
      <div className="setup-fields">
        <label className="setup-field">
          Committee name
          <input
            type="text"
            value={state.name}
            placeholder="e.g. General Assembly"
            onChange={(e) => dispatch({ type: 'committee/update', name: e.target.value })}
          />
        </label>
        <label className="setup-field">
          Topic
          <input
            type="text"
            value={state.topic}
            placeholder="e.g. Reform of the veto"
            onChange={(e) => dispatch({ type: 'committee/update', topic: e.target.value })}
          />
        </label>
      </div>

      <div className="setup-columns">
        <section className="card col">
          <h2>Add delegations</h2>
          <input
            type="search"
            aria-label="Search countries"
            placeholder="Search countries…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
          />
          <ul className="setup-results">
            {results.map((c) => {
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

          <h3>Add custom delegation</h3>
          <div className="row">
            <input
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

          <details>
            <summary>Paste a list of countries</summary>
            <textarea
              className="setup-textarea"
              aria-label="Country list"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
            <Button onClick={addFromList}>Add from list</Button>
            {status && (
              <p role="status" className="muted">
                Added {status.added} delegation(s).
                {status.unknown.length > 0 && ` Not recognised: ${status.unknown.join(', ')}`}
              </p>
            )}
          </details>
        </section>

        <section className="card">
          <h2>Delegations ({state.delegates.length})</h2>
          {state.delegates.length === 0 ? (
            <p className="muted">No delegations yet. Add countries from the list on the left.</p>
          ) : (
            <ul className="setup-delegates">
              {state.delegates.map((d) => (
                <li key={d.id} className="setup-delegate">
                  <Flag code={d.flag} />
                  <span className="grow">{d.name}</span>
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
        </section>
      </div>

      <footer className="setup-footer">
        <Button
          variant="primary"
          size="lg"
          disabled={!canStart}
          onClick={() => dispatch({ type: 'committee/setStage', stage: 'running' })}
        >
          Start committee
        </Button>
        {!canStart && <span className="muted">{missing.join(' · ')}</span>}
      </footer>
    </main>
  )
}
