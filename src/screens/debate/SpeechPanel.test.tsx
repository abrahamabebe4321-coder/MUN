import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommitteeProvider, useCommittee } from '../../state/CommitteeContext'
import { createCommittee, type CommitteeState, type DebateMode } from '../../state/state'
import { reducer } from '../../state/reducer'
import { isRunning } from '../../domain/timer'
import { SpeechPanel } from './SpeechPanel'

function initial(mode: Exclude<DebateMode, 'none'> = 'gsl'): CommitteeState {
  let s = createCommittee()
  for (const [id, name] of [['et', 'Ethiopia'], ['ke', 'Kenya'], ['us', 'United States']]) {
    s = reducer(s, { type: 'delegate/add', id, name, flag: id })
    s = reducer(s, { type: 'attendance/set', id, attendance: 'present' })
  }
  s = reducer(s, { type: 'committee/setStage', stage: 'running' })
  s = reducer(s, { type: 'debate/start', mode, speakerSeconds: 60, totalSeconds: 600 })
  s = reducer(s, { type: 'speakers/add', id: 'et' })
  s = reducer(s, { type: 'speakers/add', id: 'ke' })
  s = reducer(s, { type: 'speakers/next' })
  return s
}

let cur: ReturnType<typeof useCommittee>
function Probe() {
  cur = useCommittee()
  return null
}

function setup(mode: Exclude<DebateMode, 'none'> = 'gsl') {
  render(
    <CommitteeProvider initial={initial(mode)}>
      <SpeechPanel />
      <Probe />
      <input aria-label="outside" />
    </CommitteeProvider>,
  )
  return userEvent.setup()
}
const openAdjust = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByText('Adjust'))
const speechPip = (name: RegExp) =>
  within(screen.getByRole('radiogroup', { name: 'Rate this speech' })).getByRole('radio', { name })
const kinds = (k: string) => cur.state.interactions.filter((i) => i.kind === k)

beforeEach(() => localStorage.clear())

describe('SpeechPanel timers', () => {
  it('shows the speaker time and toggles start/pause', async () => {
    const user = setup()
    expect(screen.getByRole('timer')).toHaveTextContent('1:00')
    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(isRunning(cur.state.debate.speechTimer)).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(isRunning(cur.state.debate.speechTimer)).toBe(false)
  })
  it('adds 15s and applies presets', async () => {
    const user = setup()
    await openAdjust(user)
    await user.click(screen.getByRole('button', { name: 'Add 15 seconds' }))
    expect(screen.getByRole('timer')).toHaveTextContent('1:15')
    await user.click(screen.getByRole('button', { name: '1:30' }))
    expect(cur.state.debate.speakerSeconds).toBe(90)
  })
  it('caucus controls only in mod mode', async () => {
    const user = setup('mod')
    await openAdjust(user)
    expect(screen.getByRole('button', { name: 'Start caucus clock' })).toBeInTheDocument()
    expect(screen.getByText(/speaker\(s\) left/)).toHaveTextContent('Caucus 10:00, about 10 speaker(s) left')
  })
  it('no caucus controls in gsl', () => {
    setup('gsl')
    expect(screen.queryByText(/speaker\(s\) left/)).toBeNull()
  })
})

describe('SpeechPanel speech rating', () => {
  it('adds, updates and clears the speech rating', async () => {
    const user = setup()
    expect(screen.getByText('Ethiopia')).toBeInTheDocument()
    await user.click(speechPip(/^Decent/))
    expect(kinds('gsl_speech')).toHaveLength(1)
    expect(kinds('gsl_speech')[0]).toMatchObject({ delegateId: 'et', tier: 2, refId: cur.state.debate.speechRef })
    await user.click(speechPip(/^Insightful/))
    expect(kinds('gsl_speech')).toHaveLength(1)
    expect(kinds('gsl_speech')[0].tier).toBe(3)
    // clicking the chosen pip again clears the rating
    await user.click(speechPip(/^Insightful/))
    expect(kinds('gsl_speech')).toHaveLength(0)
  })
  it('opening mode: opening_speech and no POI card', async () => {
    const user = setup('opening')
    expect(screen.queryByText('Points of information')).toBeNull()
    await user.click(speechPip(/^Works/))
    expect(kinds('opening_speech')).toHaveLength(1)
  })
})

describe('SpeechPanel POIs', () => {
  async function addPoi(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('combobox', { name: 'POI from' }))
    await user.click(screen.getByRole('option', { name: /Kenya/ }))
    await user.click(within(screen.getByRole('radiogroup', { name: 'Rate the question' })).getByRole('radio', { name: /^Insightful/ }))
  }
  it('excludes the speaker from asker options', async () => {
    const user = setup()
    await user.click(screen.getByRole('combobox', { name: 'POI from' }))
    expect(screen.queryByRole('option', { name: /Ethiopia/ })).toBeNull()
    expect(screen.getByRole('option', { name: /Kenya/ })).toBeInTheDocument()
  })
  it('logs question, answer, follow-up and removes them in one undo step', async () => {
    const user = setup()
    expect(screen.getByText('No POIs logged for this speech yet.')).toBeInTheDocument()
    await addPoi(user)
    const poi = kinds('poi_asked')[0]
    expect(poi).toMatchObject({ delegateId: 'ke', tier: 3, refId: cur.state.debate.speechRef })
    const row = screen.getByRole('listitem', { name: 'POI from Kenya' })
    await user.click(within(within(row).getByRole('radiogroup', { name: 'Answer quality' })).getByRole('radio', { name: 'Decent' }))
    expect(kinds('poi_answer')[0]).toMatchObject({ delegateId: 'et', tier: 2, refId: poi.id })
    await user.click(within(within(row).getByRole('radiogroup', { name: 'Follow-up quality' })).getByRole('radio', { name: 'Works' }))
    expect(kinds('follow_up')[0]).toMatchObject({ delegateId: 'ke', tier: 1, refId: poi.id })
    await user.click(within(within(row).getByRole('radiogroup', { name: 'Question quality' })).getByRole('radio', { name: 'Works' }))
    expect(kinds('poi_asked')[0].tier).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Remove POI from Kenya' }))
    expect(cur.state.interactions).toHaveLength(0)
    cur.undo()
    await screen.findByRole('listitem', { name: 'POI from Kenya' })
    expect(cur.state.interactions).toHaveLength(3)
  })
})

describe('SpeechPanel advancing', () => {
  it('Next speaker gives floor to Kenya and resets the speech', async () => {
    const user = setup()
    await user.click(speechPip(/^Decent/))
    await user.click(screen.getByRole('button', { name: 'Start' }))
    await user.click(screen.getByRole('button', { name: /Next speaker/ }))
    expect(cur.state.debate.currentSpeakerId).toBe('ke')
    expect(isRunning(cur.state.debate.speechTimer)).toBe(false)
    within(screen.getByRole('radiogroup', { name: 'Rate this speech' }))
      .getAllByRole('radio')
      .forEach((b) => expect(b).toHaveAttribute('aria-checked', 'false'))
    expect(screen.getByRole('button', { name: /Finish speech/ })).toBeInTheDocument()
  })
  it('n key advances; space toggles but not while typing in a combobox', async () => {
    const user = setup()
    await user.keyboard(' ')
    expect(isRunning(cur.state.debate.speechTimer)).toBe(true)
    await user.click(screen.getByRole('combobox', { name: 'POI from' }))
    await user.keyboard(' ')
    expect(isRunning(cur.state.debate.speechTimer)).toBe(true)
    await user.keyboard('n')
    expect(cur.state.debate.currentSpeakerId).toBe('et')
    await user.click(document.body)
    await user.keyboard('n')
    expect(cur.state.debate.currentSpeakerId).toBe('ke')
  })
})
