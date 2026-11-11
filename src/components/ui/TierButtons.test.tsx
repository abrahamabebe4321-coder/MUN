import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TierButtons } from './TierButtons'

describe('TierButtons', () => {
  it('renders three labelled buttons and reports picks', async () => {
    const onPick = vi.fn()
    render(<TierButtons onPick={onPick} />)
    expect(screen.getAllByRole('button')).toHaveLength(3)
    await userEvent.click(screen.getByRole('button', { name: 'Works' }))
    await userEvent.click(screen.getByRole('button', { name: 'Decent' }))
    await userEvent.click(screen.getByRole('button', { name: 'Insightful' }))
    expect(onPick.mock.calls.map((c) => c[0])).toEqual([1, 2, 3])
    expect(screen.getByRole('button', { name: 'Works' })).toHaveClass('tier-btn', 'tier-1')
  })
  it('shows points with sign and aria-label', () => {
    render(<TierButtons onPick={() => {}} points={(t) => (t === 1 ? -4 : t * 3)} />)
    expect(screen.getByRole('button', { name: 'Works (-4 points)' })).toHaveTextContent('-4')
    expect(screen.getByRole('button', { name: 'Works (-4 points)' })).not.toHaveTextContent('+')
    expect(screen.getByRole('button', { name: 'Decent (6 points)' })).toHaveTextContent('+6')
  })
  it('compact shows numbers only', () => {
    render(<TierButtons onPick={() => {}} compact />)
    expect(screen.getByRole('button', { name: 'Insightful' })).toHaveTextContent(/^3$/)
  })
  it('disables buttons', () => {
    render(<TierButtons onPick={() => {}} disabled />)
    screen.getAllByRole('button').forEach((b) => expect(b).toBeDisabled())
  })
})
