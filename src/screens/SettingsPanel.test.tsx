import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommitteeProvider, useCommittee } from '../state/CommitteeContext'
import { createCommittee } from '../state/state'
import type { CommitteeState } from '../state/state'
import { exportJson } from '../state/storage'
import { listCommittees } from '../state/library'
import { DEFAULT_SCORING } from '../domain/scoring'
import { SettingsPanel } from './SettingsPanel'

let current: CommitteeState
const switched = vi.fn()
function Probe() {
  current = useCommittee().state
  return null
}

function makeState(): CommitteeState {
  const s = createCommittee()
  s.name = 'Test Cmte'
  s.topic = 'Water'
  s.stage = 'running'
  s.delegates = [
    { id: 'fr', name: 'France', flag: 'fr', attendance: 'present' },
    { id: 'de', name: 'Germany', flag: 'de', attendance: 'present' },
  ]
  s.interactions = [
    { id: 'i1', delegateId: 'fr', kind: 'gsl_speech', tier: 2, passed: false, note: '', session: 1, timestamp: 1 },
  ]
  return s
}

function setup(state = makeState()) {
  const user = userEvent.setup()
  render(
    <CommitteeProvider initial={state} onSwitch={switched}>
      <SettingsPanel />
      <Probe />
    </CommitteeProvider>,
  )
  return { user, state }
}

const row = (label: string) => screen.getByText(label).closest('tr') as HTMLElement

describe('SettingsPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    switched.mockClear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('edits name and topic', async () => {
    const { user } = setup()
    const name = screen.getByLabelText('Committee name')
    await user.clear(name)
    await user.type(name, 'UNEP')
    const topic = screen.getByLabelText('Topic')
    await user.clear(topic)
    await user.type(topic, 'Air')
    expect(current.name).toBe('UNEP')
    expect(current.topic).toBe('Air')
  })

  it('changes base without mutating the original config and updates previews', async () => {
    const state = makeState()
    const original = state.scoring
    const { user } = setup(state)
    const input = screen.getByLabelText('Base points for GSL speech')
    await user.clear(input)
    await user.type(input, '10')
    expect(current.scoring.base.gsl_speech).toBe(10)
    expect(original.base.gsl_speech).toBe(6)
    const cells = within(row('GSL speech')).getAllByRole('cell')
    expect(cells.slice(3).map((c) => c.textContent)).toEqual(['10', '20', '30'])
  })

  it('typing "-" then "-3" commits only -3', async () => {
    const { user } = setup()
    const input = screen.getByLabelText('Base points for Penalty')
    await user.clear(input)
    expect(current.scoring.base.penalty).toBe(-2)
    await user.type(input, '-3')
    expect(current.scoring.base.penalty).toBe(-3)
  })

  it('clearing does not dispatch and reverts on blur', async () => {
    const { user } = setup()
    const input = screen.getByLabelText('Base points for GSL speech') as HTMLInputElement
    await user.clear(input)
    expect(input.value).toBe('')
    expect(current.scoring.base.gsl_speech).toBe(6)
    await user.tab()
    expect(input.value).toBe('6')
  })

  it('changes the Insightful multiplier', async () => {
    const { user } = setup()
    const input = screen.getByLabelText('Insightful multiplier')
    await user.clear(input)
    await user.type(input, '4')
    expect(current.scoring.tierMultiplier[3]).toBe(4)
  })

  it('edits pass bonus for motion raised', async () => {
    const { user } = setup()
    const input = screen.getByLabelText('Pass bonus for Motion raised')
    await user.clear(input)
    await user.type(input, '5')
    expect(current.scoring.passBonus.motion_raised).toBe(5)
  })

  it('resets scoring to defaults', async () => {
    const { user } = setup()
    const input = screen.getByLabelText('Base points for GSL speech')
    await user.clear(input)
    await user.type(input, '10')
    await user.click(screen.getByRole('button', { name: 'Reset scoring to defaults' }))
    expect(current.scoring).toEqual(DEFAULT_SCORING)
    expect(current.scoring).not.toBe(DEFAULT_SCORING)
    expect((screen.getByLabelText('Base points for GSL speech') as HTMLInputElement).value).toBe('6')
  })

  it('theme radio sets data-theme and persists', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('mun-chair:theme')).toBe('dark')
    await user.click(screen.getByRole('radio', { name: 'System' }))
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('Edit delegations returns to setup', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Edit delegations' }))
    expect(current.stage).toBe('setup')
    expect(current.delegates).toHaveLength(2)
  })

  it('Download backup creates and revokes an object URL', async () => {
    const create = vi.fn(() => 'blob:x')
    const revoke = vi.fn()
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke })
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Download backup' }))
    expect(create).toHaveBeenCalledTimes(1)
    expect(revoke).toHaveBeenCalledWith('blob:x')
  })

  it('restores a backup into a new committee without touching this one', async () => {
    const { user } = setup()
    const other = createCommittee()
    other.name = 'Other'
    other.stage = 'running'
    const file = new File([exportJson(other)], 'b.json', { type: 'application/json' })
    const before = listCommittees().length
    await user.upload(screen.getByLabelText('Restore from backup'), file)
    expect(await screen.findByText(/Restore the backup “Other” as a new committee\?/)).toBeInTheDocument()
    expect(current.name).toBe('Test Cmte')
    await user.click(screen.getByRole('button', { name: 'Restore' }))
    expect(current.name).toBe('Test Cmte')
    const list = listCommittees()
    expect(list).toHaveLength(before + 1)
    const made = list.find((e) => e.name === 'Other')
    expect(made).toBeDefined()
    expect(switched).toHaveBeenCalledWith(made!.id)
  })

  it('shows an alert for an invalid file', async () => {
    const { user } = setup()
    const file = new File(['nope'], 'b.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Restore from backup'), file)
    expect((await screen.findByRole('alert')).textContent).toBe('That file is not a valid MUN Chair backup.')
    expect(current.name).toBe('Test Cmte')
  })

  it('New committee creates and switches without erasing this one', async () => {
    const { user } = setup()
    const before = listCommittees().length
    await user.click(screen.getByRole('button', { name: 'New committee' }))
    expect(current.delegates).toHaveLength(2)
    expect(listCommittees()).toHaveLength(before + 1)
    expect(switched).toHaveBeenCalledTimes(1)
  })
})
