import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommitteeProvider, useCommittee } from '../../state/CommitteeContext'
import { reducer } from '../../state/reducer'
import { createCommittee } from '../../state/state'
import type { Action } from '../../state/reducer'
import type { CommitteeState } from '../../state/state'
import { QuickLogBar, QuickLogModal } from './QuickLog'

function makeState(): CommitteeState {
  const actions: Action[] = [
    { type: 'delegate/add', id: 'et', name: 'Ethiopia', flag: 'et' },
    { type: 'delegate/add', id: 'ke', name: 'Kenya', flag: 'ke' },
    { type: 'delegate/add', id: 'us', name: 'United States', flag: 'us' },
    { type: 'delegate/add', id: 'gb', name: 'United Kingdom', flag: 'gb' },
    { type: 'attendance/set', id: 'et', attendance: 'present' },
    { type: 'attendance/set', id: 'ke', attendance: 'present' },
    { type: 'attendance/set', id: 'us', attendance: 'present' },
    { type: 'committee/setStage', stage: 'running' },
    { type: 'debate/start', mode: 'gsl' },
  ]
  return actions.reduce(reducer, createCommittee())
}

let current: CommitteeState
function Probe() {
  current = useCommittee().state
  return null
}

function setupBar() {
  render(
    <CommitteeProvider initial={makeState()}>
      <QuickLogBar />
      <Probe />
    </CommitteeProvider>,
  )
  return userEvent.setup()
}

async function pick(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('combobox', { name: 'Delegate' }))
  await user.click(screen.getByRole('option', { name: new RegExp(name) }))
}

beforeEach(() => localStorage.clear())

describe('QuickLog', () => {
  it('bar shows four buttons', () => {
    setupBar()
    const group = screen.getByRole('group', { name: 'Quick log' })
    expect(group.querySelectorAll('button')).toHaveLength(4)
    for (const n of ['Point of order', 'Parliamentary inquiry', 'Personal privilege', 'Penalty'])
      expect(screen.getByRole('button', { name: n })).toBeInTheDocument()
  })

  it('logs a point of order with tier Decent and closes', async () => {
    const user = setupBar()
    await user.click(screen.getByRole('button', { name: 'Point of order' }))
    expect(screen.getByRole('dialog', { name: 'Log: Point of order' })).toBeInTheDocument()
    await pick(user, 'Kenya')
    await user.click(screen.getByRole('button', { name: /^Decent/ }))
    expect(current.interactions).toHaveLength(1)
    expect(current.interactions[0]).toMatchObject({ delegateId: 'ke', kind: 'point_of_order', tier: 2 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('disables tier buttons until a delegate is chosen', async () => {
    const user = setupBar()
    await user.click(screen.getByRole('button', { name: 'Point of order' }))
    expect(screen.getByRole('button', { name: /^Decent/ })).toBeDisabled()
    await pick(user, 'Kenya')
    expect(screen.getByRole('button', { name: /^Decent/ })).toBeEnabled()
  })

  it('does not offer absent delegates', async () => {
    const user = setupBar()
    await user.click(screen.getByRole('button', { name: 'Point of order' }))
    await user.click(screen.getByRole('combobox', { name: 'Delegate' }))
    expect(screen.queryByRole('option', { name: 'United Kingdom' })).not.toBeInTheDocument()
  })

  it('saves the note trimmed', async () => {
    const user = setupBar()
    await user.click(screen.getByRole('button', { name: 'Point of order' }))
    await pick(user, 'Kenya')
    await user.type(screen.getByLabelText('Note (optional)'), '  hello  ')
    await user.click(screen.getByRole('button', { name: /^Works/ }))
    expect(current.interactions[0].note).toBe('hello')
  })

  it('personal privilege is flat: Log button, tier 1', async () => {
    const user = setupBar()
    await user.click(screen.getByRole('button', { name: 'Personal privilege' }))
    expect(screen.queryByRole('button', { name: /^Decent/ })).not.toBeInTheDocument()
    const log = screen.getByRole('button', { name: 'Log' })
    expect(log).toBeDisabled()
    await pick(user, 'Ethiopia')
    await user.click(log)
    expect(current.interactions[0]).toMatchObject({ delegateId: 'et', kind: 'personal_privilege', tier: 1 })
  })

  it('penalty shows negative points', async () => {
    const user = setupBar()
    await user.click(screen.getByRole('button', { name: 'Penalty' }))
    expect(screen.getByText('Minor / Serious / Severe')).toBeInTheDocument()
    expect(screen.getByText('-2')).toBeInTheDocument()
    expect(screen.getByText('-6')).toBeInTheDocument()
  })

  it('supports a preselected delegate and refId', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <CommitteeProvider initial={makeState()}>
        <QuickLogModal kind="poi_asked" delegateId="us" refId="r1" onClose={onClose} />
        <Probe />
      </CommitteeProvider>,
    )
    expect(screen.getByRole('combobox', { name: 'Delegate' })).toHaveValue('United States')
    await user.click(screen.getByRole('button', { name: /^Works/ }))
    expect(current.interactions[0]).toMatchObject({ delegateId: 'us', refId: 'r1', tier: 1 })
    expect(onClose).toHaveBeenCalled()
  })
})
