import { Fragment, useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useCommittee } from '../state/CommitteeContext'
import { createCommittee } from '../state/state'
import { exportJson, importJson } from '../state/storage'
import type { CommitteeState } from '../state/state'
import { DEFAULT_SCORING, CATEGORY_LABELS, KIND_LABELS, TIER_LABELS, categoryOf, scoreInteraction } from '../domain/scoring'
import type { Category } from '../domain/scoring'
import type { InteractionKind, ScoringConfig, Tier } from '../domain/types'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { getTheme, setTheme } from '../theme'
import type { ThemeChoice } from '../theme'
import './settings.css'

const KINDS: InteractionKind[] = Object.keys(KIND_LABELS) as InteractionKind[]
const CATEGORIES: Category[] = ['speeches', 'pois', 'procedure', 'resolutions', 'conduct']
const TIERS: Tier[] = [1, 2, 3]
const PASS_BONUS_KINDS: InteractionKind[] = ['motion_raised', 'amendment_proposed']

function NumField({
  value,
  onCommit,
  label,
}: {
  value: number
  onCommit: (n: number) => void
  label: string
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => {
    setText((t) => (Number(t) === value && t.trim() !== '' ? t : String(value)))
  }, [value])
  return (
    <input
      type="number"
      step={1}
      className="settings-num"
      aria-label={label}
      value={text}
      onChange={(e) => {
        const t = e.target.value
        setText(t)
        const n = Number(t)
        if (t.trim() !== '' && Number.isFinite(n)) onCommit(n)
      }}
      onBlur={() => setText(String(value))}
    />
  )
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'committee'
  )
}

export function SettingsPanel() {
  const { state, dispatch } = useCommittee()
  const [theme, setThemeState] = useState<ThemeChoice>(() => getTheme())
  const [pending, setPending] = useState<CommitteeState | null>(null)
  const [importError, setImportError] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  const sc = state.scoring

  const setScoring = (next: ScoringConfig) => dispatch({ type: 'scoring/set', scoring: next })
  const setBase = (kind: InteractionKind, n: number) =>
    setScoring({ ...sc, base: { ...sc.base, [kind]: n } })
  const setBonus = (kind: InteractionKind, n: number) =>
    setScoring({ ...sc, passBonus: { ...sc.passBonus, [kind]: n } })
  const setMult = (tier: Tier, n: number) =>
    setScoring({ ...sc, tierMultiplier: { ...sc.tierMultiplier, [tier]: n } })

  const download = () => {
    const blob = new Blob([exportJson(state)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug(state.name)}-backup.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return
    setImportError(false)
    let parsed: CommitteeState | null = null
    try {
      parsed = importJson(await file.text())
    } catch {
      parsed = null
    }
    if (parsed) setPending(parsed)
    else setImportError(true)
    input.value = ''
  }

  return (
    <section className="settings" aria-label="Settings">
      <div className="settings-card">
        <h2>Committee</h2>
        <label className="settings-field">
          Committee name
          <input
            type="text"
            value={state.name}
            onChange={(e) => dispatch({ type: 'committee/update', name: e.target.value })}
          />
        </label>
        <label className="settings-field">
          Topic
          <input
            type="text"
            value={state.topic}
            onChange={(e) => dispatch({ type: 'committee/update', topic: e.target.value })}
          />
        </label>
        <div className="settings-row">
          <Button onClick={() => dispatch({ type: 'committee/setStage', stage: 'setup' })}>
            Edit delegations
          </Button>
          <p className="settings-muted">
            Returns to the setup screen; scores are kept. Press Start committee to come back.
          </p>
        </div>
      </div>

      <div className="settings-card">
        <h2>Scoring</h2>
        <p className="settings-muted">
          Points = base × quality multiplier. Changes apply immediately to everything already logged.
        </p>
        <div className="settings-mults">
          {TIERS.map((t) => (
            <label key={t} className="settings-field">
              {TIER_LABELS[t]} multiplier
              <NumField
                label={`${TIER_LABELS[t]} multiplier`}
                value={sc.tierMultiplier[t]}
                onCommit={(n) => setMult(t, n)}
              />
            </label>
          ))}
        </div>
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead>
              <tr>
                <th>Interaction</th>
                <th>Base</th>
                <th>Pass bonus</th>
                {TIERS.map((t) => (
                  <th key={t}>{TIER_LABELS[t]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((cat) => categoryRows(cat))}
            </tbody>
          </table>
        </div>
        <div>
          <Button onClick={() => setScoring(JSON.parse(JSON.stringify(DEFAULT_SCORING)) as ScoringConfig)}>
            Reset scoring to defaults
          </Button>
        </div>
      </div>

      <div className="settings-card">
        <h2>Appearance</h2>
        <div className="settings-radios" role="radiogroup" aria-label="Theme">
          {(['system', 'light', 'dark'] as ThemeChoice[]).map((c) => (
            <label key={c}>
              <input
                type="radio"
                name="theme"
                value={c}
                checked={theme === c}
                onChange={() => {
                  setTheme(c)
                  setThemeState(c)
                }}
              />{' '}
              {c[0].toUpperCase() + c.slice(1)}
            </label>
          ))}
        </div>
      </div>

      <div className="settings-card">
        <h2>Backup</h2>
        <div className="settings-row">
          <Button onClick={download}>Download backup</Button>
          <label className="settings-field">
            Restore from backup
            <input type="file" accept=".json,application/json" onChange={onFile} />
          </label>
        </div>
        {importError ? (
          <p className="settings-error" role="alert">
            That file is not a valid MUN Chair backup.
          </p>
        ) : null}
        <div>
          <Button variant="danger" onClick={() => setConfirmNew(true)}>
            Start a new committee
          </Button>
        </div>
      </div>

      {pending ? (
        <Modal
          title="Restore backup"
          onClose={() => setPending(null)}
          footer={
            <>
              <Button onClick={() => setPending(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  dispatch({ type: 'state/replace', state: pending })
                  setPending(null)
                }}
              >
                Replace
              </Button>
            </>
          }
        >
          <p>
            Replace the current committee with the backup “{pending.name}”? This cannot be undone.
          </p>
        </Modal>
      ) : null}
      {confirmNew ? (
        <Modal
          title="Start a new committee"
          onClose={() => setConfirmNew(false)}
          footer={
            <>
              <Button onClick={() => setConfirmNew(false)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  dispatch({ type: 'state/replace', state: createCommittee() })
                  setConfirmNew(false)
                }}
              >
                Erase and start new
              </Button>
            </>
          }
        >
          <p>Erase this committee and start a new one? Download a backup first if you want to keep it.</p>
        </Modal>
      ) : null}
    </section>
  )

  function categoryRows(cat: Category) {
    const kinds = KINDS.filter((k) => categoryOf(k) === cat)
    return (
      <Fragment key={cat}>
        <tr className="settings-group">
          <td colSpan={6}>{CATEGORY_LABELS[cat]}</td>
        </tr>
        {kinds.map((kind) => {
          const flat = sc.flatKinds.includes(kind)
          return (
            <tr key={kind}>
              <td>{KIND_LABELS[kind]}</td>
              <td>
                <NumField
                  label={`Base points for ${KIND_LABELS[kind]}`}
                  value={sc.base[kind]}
                  onCommit={(n) => setBase(kind, n)}
                />
              </td>
              <td>
                {PASS_BONUS_KINDS.includes(kind) ? (
                  <NumField
                    label={`Pass bonus for ${KIND_LABELS[kind]}`}
                    value={sc.passBonus[kind] ?? 0}
                    onCommit={(n) => setBonus(kind, n)}
                  />
                ) : (
                  '–'
                )}
              </td>
              {flat ? (
                <>
                  <td>{scoreInteraction({ kind, tier: 1, passed: false }, sc)}</td>
                  <td colSpan={2} className="settings-muted">
                    flat
                  </td>
                </>
              ) : (
                TIERS.map((t) => (
                  <td key={t}>{scoreInteraction({ kind, tier: t, passed: false }, sc)}</td>
                ))
              )}
            </tr>
          )
        })}
      </Fragment>
    )
  }
}
