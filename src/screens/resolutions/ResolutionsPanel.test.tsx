import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommitteeProvider, useCommittee } from '../../state/CommitteeContext'
import { createCommittee, type CommitteeState } from '../../state/state'
import { reducer } from '../../state/reducer'
import { isRunning } from '../../domain/timer'
import { NavContext } from '../nav'
import { ResolutionsPanel } from './ResolutionsPanel'

function initial(extra: (s: CommitteeState) => CommitteeState = (s) => s): CommitteeState {
  let s = createCommittee()
  for (const [id, name] of [['et', 'Ethiopia'], ['ke', 'Kenya'], ['us', 'United States'], ['gb', 'United Kingdom'], ['fr', 'France']]) {
    s = reducer(s, { type: 'delegate/add', id, name, flag: id })
    s = reducer(s, { type: 'attendance/set', id, attendance: id === 'fr' ? 'absent' : 'present' })
  }
  s = reducer(s, { type: 'committee/setStage', stage: 'running' })
  return extra(s)
}
const withRes = (s: CommitteeState) => reducer(s, { type: 'resolution/add', name: 'DR 1.1' })
const withAmend = (s: CommitteeState) =>
  reducer(
    reducer(withRes(s), { type: 'amendment/add', resolutionId: 'r' + s.nextId, proposerId: 'ke', description: 'Strike clause 3' }),
    { type: 'interaction/add', delegateId: 'ke', kind: 'amendment_proposed', tier: 2, refId: 'a' + (s.nextId + 1), now: 1 },
  )

let cur: ReturnType<typeof useCommittee>
function Probe() {
  cur = useCommittee()
  return null
}
let navSpy: ReturnType<typeof vi.fn<(tab: string) => void>>
function setup(state: CommitteeState) {
  navSpy = vi.fn<(tab: string) => void>()
  render(
    <CommitteeProvider initial={state}>
      <NavContext.Provider value={navSpy}>
        <ResolutionsPanel />
        <Probe />
      </NavContext.Provider>
    </CommitteeProvider>,
  )
  return userEvent.setup()
}
const interactions = (k: string) => cur.state.interactions.filter((i) => i.kind === k)

beforeEach(() => localStorage.clear())

describe('ResolutionsPanel', () => {
  it('shows empty state', () => {
    setup(initial())
    expect(screen.getByText('No draft resolutions yet.')).toBeInTheDocument()
  })

  it('adds a resolution; blank is disabled', async () => {
    const user = setup(initial())
    const btn = screen.getByRole('button', { name: 'Add resolution' })
    expect(btn).toBeDisabled()
    await user.type(screen.getByLabelText('Resolution name'), '  DR 1.1 ')
    await user.click(btn)
    expect(cur.state.resolutions.map((r) => r.name)).toEqual(['DR 1.1'])
    expect(screen.getByLabelText('Resolution name')).toHaveValue('')
  })

  it('renames', async () => {
    const user = setup(initial(withRes))
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    const input = screen.getByLabelText('Resolution name for DR 1.1')
    await user.clear(input)
    await user.type(input, 'DR 2.0{Enter}')
    expect(cur.state.resolutions[0].name).toBe('DR 2.0')
  })

  it('adds and removes sponsors/signatories, excluding listed delegates', async () => {
    const user = setup(initial(withRes))
    await user.click(screen.getByLabelText('Add sponsor to DR 1.1'))
    await user.click(screen.getByRole('option', { name: /Kenya/ }))
    expect(cur.state.resolutions[0].sponsorIds).toEqual(['ke'])
    expect(screen.getByText('Sponsors (1)')).toBeInTheDocument()
    await user.click(screen.getByLabelText('Add signatory to DR 1.1'))
    expect(screen.queryByRole('option', { name: /Kenya/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: /Ethiopia/ }))
    expect(cur.state.resolutions[0].signatoryIds).toEqual(['et'])
    await user.click(screen.getByLabelText('Remove Kenya from sponsors'))
    await user.click(screen.getByLabelText('Remove Ethiopia from signatories'))
    expect(cur.state.resolutions[0].sponsorIds).toEqual([])
    expect(cur.state.resolutions[0].signatoryIds).toEqual([])
  })

  it('Present starts resolution debate in one undo step', async () => {
    const user = setup(
      initial((s) => reducer(s, { type: 'resolution/add', name: 'DR 1.1', sponsorIds: ['et', 'ke'] })),
    )
    await user.click(screen.getByRole('button', { name: 'Present' }))
    const r = cur.state.resolutions[0]
    expect(r.status).toBe('presented')
    expect(cur.state.debate.mode).toBe('resolution')
    expect(cur.state.debate.resolutionId).toBe(r.id)
    expect(cur.state.debate.speakersList).toEqual(['et', 'ke'])
    expect(navSpy).toHaveBeenCalledWith('debate')
    cur.undo()
    await screen.findByText('Draft')
    expect(cur.state.resolutions[0].status).toBe('draft')
    expect(cur.state.debate.mode).toBe('none')
  })

  it('adds an amendment with interaction, one undo step; absent not offered', async () => {
    const user = setup(initial(withRes))
    const art = screen.getByRole('article', { name: 'DR 1.1' })
    await user.click(within(art).getByLabelText('Amendment proposer for DR 1.1'))
    expect(screen.queryByRole('option', { name: /France/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: /Kenya/ }))
    await user.type(within(art).getByLabelText('Amendment'), 'Strike clause 3')
    await user.click(within(art).getByRole('button', { name: /Insightful/ }))
    await user.click(within(art).getByRole('button', { name: 'Add amendment' }))
    const am = cur.state.resolutions[0].amendments[0]
    expect(am.description).toBe('Strike clause 3')
    const i = interactions('amendment_proposed')[0]
    expect(i.refId).toBe(am.id)
    expect(i.tier).toBe(3)
    expect(i.delegateId).toBe('ke')
    cur.undo()
    await screen.findByText('Amendments (0)')
    expect(cur.state.resolutions[0].amendments).toHaveLength(0)
    expect(interactions('amendment_proposed')).toHaveLength(0)
  })

  async function recordQuick(user: ReturnType<typeof userEvent.setup>, f: string, a: string) {
    const dlg = screen.getByRole('dialog', { name: 'Vote' })
    await user.clear(within(dlg).getByLabelText('For'))
    await user.type(within(dlg).getByLabelText('For'), f)
    await user.clear(within(dlg).getByLabelText('Against'))
    await user.type(within(dlg).getByLabelText('Against'), a)
    await user.click(within(dlg).getByRole('button', { name: 'Record vote' }))
  }

  it('amendment vote passes and flags interaction', async () => {
    const user = setup(initial(withAmend))
    await user.click(screen.getByRole('button', { name: 'Vote' }))
    await recordQuick(user, '3', '1')
    expect(cur.state.resolutions[0].amendments[0].status).toBe('passed')
    expect(interactions('amendment_proposed')[0].passed).toBe(true)
    expect(screen.queryByRole('button', { name: 'Vote' })).not.toBeInTheDocument()
  })

  it('amendment vote can fail', async () => {
    const user = setup(initial(withAmend))
    await user.click(screen.getByRole('button', { name: 'Vote' }))
    await recordQuick(user, '1', '3')
    expect(cur.state.resolutions[0].amendments[0].status).toBe('failed')
  })

  it('removes an amendment', async () => {
    const user = setup(initial(withAmend))
    await user.click(screen.getByRole('button', { name: 'Remove amendment: Strike clause 3' }))
    expect(cur.state.resolutions[0].amendments).toHaveLength(0)
    expect(interactions('amendment_proposed')).toHaveLength(0)
  })

  it('amendment speech modal', async () => {
    const user = setup(initial(withAmend))
    await user.click(screen.getByRole('button', { name: 'Speech' }))
    const dlg = screen.getByRole('dialog', { name: 'Amendment speech' })
    expect(within(dlg).getByLabelText('Speaker')).toHaveValue('Kenya')
    await user.click(within(dlg).getByRole('button', { name: 'Start' }))
    expect(isRunning(cur.state.debate.speechTimer)).toBe(true)
    const tiers = () => dlg.querySelectorAll<HTMLButtonElement>('.tier-buttons button')
    await user.click(tiers()[1])
    expect(interactions('amendment_speech')).toHaveLength(1)
    expect(interactions('amendment_speech')[0].tier).toBe(2)
    expect(interactions('amendment_speech')[0].delegateId).toBe('ke')
    await user.click(tiers()[2])
    expect(interactions('amendment_speech')).toHaveLength(1)
    expect(interactions('amendment_speech')[0].tier).toBe(3)
    await user.click(within(dlg).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(isRunning(cur.state.debate.speechTimer)).toBe(false)
  })

  it('resolution vote passes', async () => {
    const user = setup(initial(withRes))
    await user.click(screen.getByRole('button', { name: 'Vote on resolution' }))
    const dlg = screen.getByRole('dialog', { name: 'Vote' })
    await user.click(within(dlg).getByRole('button', { name: 'All for' }))
    await user.click(within(dlg).getByRole('button', { name: 'Record vote' }))
    expect(cur.state.resolutions[0].status).toBe('passed')
    expect(screen.getByText('Passed')).toBeInTheDocument()
  })

  it('deletes a resolution with its amendment interactions', async () => {
    const user = setup(initial(withAmend))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText(/Delete DR 1.1\?/)).toBeInTheDocument()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(cur.state.resolutions).toHaveLength(0)
    expect(interactions('amendment_proposed')).toHaveLength(0)
    expect(screen.getByText('No draft resolutions yet.')).toBeInTheDocument()
  })
})
