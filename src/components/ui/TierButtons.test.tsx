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
  it('uses custom labels for text and aria-labels', () => {
    render(<TierButtons onPick={() => {}} labels={{ 1: 'Minor', 2: 'Serious', 3: 'Severe' }} points={() => -2} />)
    expect(screen.getByRole('button', { name: 'Serious (-2 points)' })).toHaveTextContent('Serious')
    expect(screen.queryByRole('button', { name: /Works/ })).toBeNull()
  })
  it('compact shows numbers only', () => {
    render(<TierButtons onPick={() => {}} compact />)
    expect(screen.getByRole('button', { name: 'Insightful' })).toHaveTextContent(/^3$/)
  })
  it('disables buttons', () => {
    render(<TierButtons onPick={() => {}} disabled />)
    screen.getAllByRole('button').forEach((b) => expect(b).toBeDisabled())
  })
  it('marks the selected tier', () => {
    render(<TierButtons onPick={() => {}} selected={2} />)
    const decent = screen.getByRole('button', { name: 'Decent' })
    expect(decent).toHaveClass('is-selected')
    expect(decent).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Works' })).not.toHaveClass('is-selected')
    expect(screen.getByRole('button', { name: 'Works' })).toHaveAttribute('aria-pressed', 'false')
  })
  it('null selection pressed false everywhere; undefined omits aria-pressed', () => {
    const { unmount } = render(<TierButtons onPick={() => {}} selected={null} />)
    screen.getAllByRole('button').forEach((b) => expect(b).toHaveAttribute('aria-pressed', 'false'))
    unmount()
    render(<TierButtons onPick={() => {}} />)
    screen.getAllByRole('button').forEach((b) => expect(b).not.toHaveAttribute('aria-pressed'))
  })
})
