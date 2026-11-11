import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommitteeProvider, useCommittee } from '../../state/CommitteeContext'
import { reducer } from '../../state/reducer'
import { createCommittee } from '../../state/state'
import type { Action } from '../../state/reducer'
import type { CommitteeState } from '../../state/state'
import { SpeakersPanel } from './SpeakersPanel'

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

function setup() {
  render(
    <CommitteeProvider initial={makeState()}>
      <SpeakersPanel />
      <Probe />
    </CommitteeProvider>,
  )
  return userEvent.setup()
}

const queueNames = () => screen.queryAllByRole('listitem').map((li) => li.getAttribute('aria-label'))

async function addViaBox(user: ReturnType<typeof userEvent.setup>, name: string) {
  const box = screen.getByRole('combobox', { name: 'Add speaker' })
  await user.click(box)
  await user.click(screen.getByRole('option', { name: new RegExp(name) }))
  return box
}

beforeEach(() => localStorage.clear())

describe('SpeakersPanel', () => {
  it('shows the empty state', () => {
    setup()
    expect(screen.getByText('The speakers list is empty.')).toBeInTheDocument()
  })

  it('adds via the combobox and clears the box', async () => {
    const user = setup()
    const box = await addViaBox(user, 'Kenya')
    expect(current.debate.speakersList).toEqual(['ke'])
    expect(box).toHaveValue('')
    expect(queueNames()).toEqual(['Kenya'])
  })

  it('does not offer absent or queued delegates', async () => {
    const user = setup()
    await user.click(screen.getByRole('combobox', { name: 'Add speaker' }))
    const names = () => screen.getAllByRole('option').map((o) => o.textContent)
    expect(names()).toEqual(['Ethiopia', 'Kenya', 'United States'])
    await user.click(screen.getByRole('option', { name: /Kenya/ }))
    await user.keyboard('{ArrowDown}')
    expect(names()).toEqual(['Ethiopia', 'United States'])
  })

  it('reorders and disables the end buttons', async () => {
    const user = setup()
    for (const id of ['et', 'ke', 'us']) await user.click(screen.getByRole('button', { name: new RegExp(`^Add ${{ et: 'Ethiopia', ke: 'Kenya', us: 'United States' }[id]} to`) }))
    expect(current.debate.speakersList).toEqual(['et', 'ke', 'us'])
    expect(screen.getByRole('button', { name: 'Move Ethiopia up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move United States down' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Move Kenya up' }))
    expect(queueNames()).toEqual(['Kenya', 'Ethiopia', 'United States'])
    await user.click(screen.getByRole('button', { name: 'Move Kenya down' }))
    expect(queueNames()).toEqual(['Ethiopia', 'Kenya', 'United States'])
  })

  it('removes a speaker', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Add Kenya to speakers list' }))
    await user.click(screen.getByRole('button', { name: 'Remove Kenya from speakers list' }))
    expect(current.debate.speakersList).toEqual([])
    expect(screen.getByText('The speakers list is empty.')).toBeInTheDocument()
  })

  it('gives the floor: sets current speaker and removes from the queue', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Add Kenya to speakers list' }))
    await user.click(screen.getByRole('button', { name: 'Add Ethiopia to speakers list' }))
    await user.click(screen.getByRole('button', { name: 'Give floor to Ethiopia' }))
    expect(current.debate.currentSpeakerId).toBe('et')
    expect(current.debate.speakersList).toEqual(['ke'])
  })

  it('yet-to-speak chips add to the queue and leave that section', async () => {
    const user = setup()
    expect(screen.getByText('Yet to speak')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add Kenya to speakers list' }))
    expect(current.debate.speakersList).toEqual(['ke'])
    expect(screen.queryByRole('button', { name: 'Add Kenya to speakers list' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Ethiopia to speakers list' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /United Kingdom/ })).not.toBeInTheDocument()
  })

  it('shows Already spoken after speakers finish', async () => {
    const user = setup()
    expect(screen.queryByText(/Already spoken/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add Kenya to speakers list' }))
    await user.click(screen.getByRole('button', { name: 'Add Ethiopia to speakers list' }))
    await user.click(screen.getByRole('button', { name: 'Give floor to Kenya' }))
    await user.click(screen.getByRole('button', { name: 'Give floor to Ethiopia' }))
    expect(current.debate.spoken).toEqual(['ke'])
    const summary = screen.getByText('Already spoken (1)')
    const details = summary.closest('details') as HTMLElement
    expect(within(details).getByText('Kenya')).toBeInTheDocument()
  })
})
