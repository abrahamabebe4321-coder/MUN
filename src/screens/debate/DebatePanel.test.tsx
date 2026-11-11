import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { CommitteeProvider, useCommittee } from '../../state/CommitteeContext'
import { createCommittee, type CommitteeState } from '../../state/state'
import { reducer } from '../../state/reducer'
import { isRunning } from '../../domain/timer'
import { DebatePanel, StartDebateModal } from './DebatePanel'

function initial(): CommitteeState {
  let s = createCommittee()
  for (const [id, name] of [['et', 'Ethiopia'], ['ke', 'Kenya'], ['us', 'United States'], ['gb', 'United Kingdom']]) {
    s = reducer(s, { type: 'delegate/add', id, name, flag: id })
    s = reducer(s, { type: 'attendance/set', id, attendance: id === 'gb' ? 'absent' : 'present' })
  }
  return reducer(s, { type: 'committee/setStage', stage: 'running' })
}

let cur: ReturnType<typeof useCommittee>
function Probe() {
  cur = useCommittee()
  return null
}

function setup(ui: React.ReactNode = <DebatePanel />) {
  render(
    <CommitteeProvider initial={initial()}>
      {ui}
      <Probe />
    </CommitteeProvider>,
  )
  return userEvent.setup()
}

const dialog = () => within(screen.getByRole('dialog'))

beforeEach(() => localStorage.clear())

describe('DebatePanel', () => {
  it('shows idle state without End button', () => {
    setup()
    expect(screen.getByText('No debate in progress')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'End current debate' })).toBeNull()
  })

  it('requires a topic for a moderated caucus and applies defaults', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Moderated caucus' }))
    expect(dialog().getByRole('button', { name: 'Start' })).toBeDisabled()
    await user.type(dialog().getByLabelText('Topic'), '  Water access ')
    await user.click(dialog().getByRole('button', { name: 'Start' }))
    const d = cur.state.debate
    expect(d.mode).toBe('mod')
    expect(d.topic).toBe('Water access')
    expect(d.caucusTimer?.durationMs).toBe(600_000)
    expect(d.speakerSeconds).toBe(60)
    expect(screen.getByRole('heading', { name: 'Moderated caucus: Water access' })).toBeInTheDocument()
  })

  it('uses presets and shows speaker count', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Moderated caucus' }))
    await user.type(dialog().getByLabelText('Topic'), 'X')
    await user.click(dialog().getByRole('button', { name: '5:00' }))
    await user.click(dialog().getByRole('button', { name: '0:30' }))
    expect(dialog().getByText('10 speakers')).toBeInTheDocument()
    await user.click(dialog().getByRole('button', { name: 'Start' }))
    expect(cur.state.debate.caucusTimer?.durationMs).toBe(300_000)
    expect(cur.state.debate.speakerSeconds).toBe(30)
  })

  it('opening speeches queue present delegates, or none when unticked', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Opening speeches' }))
    await user.click(dialog().getByRole('button', { name: 'Start' }))
    expect(cur.state.debate.mode).toBe('opening')
    expect(cur.state.debate.speakersList).toEqual(['et', 'ke', 'us'])
    await user.click(screen.getByRole('button', { name: 'Opening speeches' }))
    await user.click(dialog().getByLabelText('Queue every present delegate in alphabetical order'))
    await user.click(dialog().getByRole('button', { name: 'Start' }))
    expect(cur.state.debate.speakersList).toEqual([])
  })

  it('starts a GSL with chosen speaker time', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'General speakers list' }))
    await user.click(dialog().getByRole('button', { name: '1:30' }))
    await user.click(dialog().getByRole('button', { name: 'Start' }))
    expect(cur.state.debate.mode).toBe('gsl')
    expect(cur.state.debate.speakerSeconds).toBe(90)
  })

  it('runs an unmoderated caucus', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Unmoderated caucus' }))
    await user.click(dialog().getByRole('button', { name: 'Start' }))
    expect(cur.state.debate.mode).toBe('unmod')
    expect(screen.getByRole('timer')).toHaveTextContent('15:00')
    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(isRunning(cur.state.debate.caucusTimer!)).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(isRunning(cur.state.debate.caucusTimer!)).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Add 1 minute' }))
    expect(screen.getByRole('timer')).toHaveTextContent('16:00')
    expect(screen.queryByRole('button', { name: 'Log leadership for United Kingdom' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Log leadership for Kenya' }))
    const modal = screen.getByRole('dialog')
    await user.click((modal.querySelector('.tier-btn') ?? within(modal).getByRole('button', { name: 'Log' })) as HTMLElement)
    const logged = cur.state.interactions.filter((i) => i.kind === 'unmod_leadership')
    expect(logged).toHaveLength(1)
    expect(logged[0].delegateId).toBe('ke')
  })

  it('End returns to none', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'General speakers list' }))
    await user.click(dialog().getByRole('button', { name: 'Start' }))
    await user.click(screen.getByRole('button', { name: 'End current debate' }))
    expect(cur.state.debate.mode).toBe('none')
  })

  it('warns when a debate is active and start is one undo step', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'General speakers list' }))
    await user.click(dialog().getByRole('button', { name: 'Start' }))
    await user.click(screen.getByRole('button', { name: 'Unmoderated caucus' }))
    expect(dialog().getByText('This ends the current debate and clears its speakers list.')).toBeInTheDocument()
    await user.click(dialog().getByRole('button', { name: 'Start' }))
    expect(cur.state.debate.mode).toBe('unmod')
    act(() => cur.undo())
    expect(cur.state.debate.mode).toBe('gsl')
  })

  it('prefills from initial', () => {
    setup(<StartDebateModal mode="mod" onClose={() => {}} initial={{ topic: 'Seas', totalSeconds: 300, speakerSeconds: 30 }} />)
    expect(screen.getByLabelText('Topic')).toHaveValue('Seas')
    expect(screen.getByLabelText('Total time')).toHaveValue('5:00')
    expect(screen.getByLabelText('Speaker time')).toHaveValue('0:30')
  })
})
