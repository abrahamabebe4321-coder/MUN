import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommitteeProvider, useCommittee } from '../state/CommitteeContext'
import { createCommittee } from '../state/state'
import { createEntry } from '../state/library'
import { SetupScreen } from './SetupScreen'

function Probe() {
  const { state } = useCommittee()
  return (
    <div
      data-testid="probe"
      data-json={JSON.stringify({
        stage: state.stage,
        name: state.name,
        topic: state.topic,
        ids: state.delegates.map((d) => d.id),
        flags: state.delegates.map((d) => d.flag),
        names: state.delegates.map((d) => d.name),
      })}
    />
  )
}

const probe = () => JSON.parse(screen.getByTestId('probe').getAttribute('data-json')!)

function setup() {
  const user = userEvent.setup()
  render(
    <CommitteeProvider initial={createCommittee()}>
      <SetupScreen />
      <Probe />
    </CommitteeProvider>,
  )
  return user
}

describe('SetupScreen', () => {
  beforeEach(() => localStorage.clear())

  it('updates name and topic', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('Committee name'), 'GA')
    await user.type(screen.getByLabelText('Topic'), 'Veto')
    expect(probe().name).toBe('GA')
    expect(probe().topic).toBe('Veto')
  })

  it('adds a searched country and disables it', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('Search countries'), 'eth')
    await user.click(screen.getByRole('button', { name: /Ethiopia/ }))
    expect(probe().ids).toEqual(['et'])
    const row = screen.getAllByRole('button', { name: /Ethiopia/ }).find((b) => b.className.includes('setup-result'))!
    expect(row).toBeDisabled()
    expect(row).toHaveTextContent('Added')
    expect(screen.getByRole('button', { name: 'Remove Ethiopia' })).toBeInTheDocument()
  })

  it('shows search results only while typing, at most 8', async () => {
    const user = setup()
    expect(document.querySelector('.setup-results')).toBeNull()
    await user.type(screen.getByLabelText('Search countries'), 'a')
    expect(document.querySelectorAll('.setup-result').length).toBe(8)
    await user.clear(screen.getByLabelText('Search countries'))
    expect(document.querySelector('.setup-results')).toBeNull()
  })

  it('Enter adds the first result', async () => {
    const user = setup()
    const input = screen.getByLabelText('Search countries')
    await user.type(input, 'eth{Enter}')
    expect(probe().ids).toEqual(['et'])
    expect(input).toHaveValue('')
  })

  it('adds custom delegations and ignores duplicates', async () => {
    const user = setup()
    await user.click(screen.getByText('More ways to add'))
    const input = screen.getByLabelText('Custom delegation name')
    await user.type(input, 'African Union')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.type(input, 'african union')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(probe().names).toEqual(['African Union'])
    expect(probe().flags).toEqual([null])
    expect(input).toHaveValue('')
  })

  it('pastes a list', async () => {
    const user = setup()
    await user.click(screen.getByText('More ways to add'))
    const ta = screen.getByLabelText('Country list')
    await user.click(ta)
    await user.paste('Kenya, USA; Narnia\nUK')
    await user.click(screen.getByRole('button', { name: 'Add from list' }))
    expect([...probe().ids].sort()).toEqual(['gb', 'ke', 'us'])
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Added 3 delegation(s).')
    expect(status).toHaveTextContent('Not recognised: Narnia')
    expect(ta).toHaveValue('Narnia')
  })

  it('removes a delegation', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('Search countries'), 'kenya{Enter}')
    expect(probe().ids).toEqual(['ke'])
    await user.click(screen.getByRole('button', { name: 'Remove Kenya' }))
    expect(probe().ids).toEqual([])
    expect(screen.getByText(/No delegations yet/)).toBeInTheDocument()
  })

  it('gates Start on name and 2 delegates', async () => {
    const user = setup()
    const start = screen.getByRole('button', { name: 'Start committee' })
    expect(start).toBeDisabled()
    await user.type(screen.getByLabelText('Committee name'), 'GA')
    const search = screen.getByLabelText('Search countries')
    await user.type(search, 'kenya{Enter}')
    expect(start).toBeDisabled()
    await user.type(search, 'france{Enter}')
    expect(start).toBeEnabled()
    await user.click(start)
    expect(probe().stage).toBe('running')
  })
  it('offers Open another committee only when others exist', async () => {
    const user = setup()
    expect(screen.queryByRole('button', { name: 'Open another committee' })).toBeNull()
    cleanup()
    createEntry()
    const again = setup()
    await again.click(screen.getByRole('button', { name: 'Open another committee' }))
    expect(screen.getByRole('dialog', { name: 'Committees' })).toBeInTheDocument()
    void user
  })
})
