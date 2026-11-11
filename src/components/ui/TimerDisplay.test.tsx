import { render, screen } from '@testing-library/react'
import { createTimer, start } from '../../domain/timer'
import { TimerDisplay } from './TimerDisplay'

describe('TimerDisplay', () => {
  it('shows the time for a paused timer', () => {
    const { container } = render(<TimerDisplay timer={createTimer(90)} now={0} label="Speaker" />)
    expect(screen.getByRole('timer')).toHaveTextContent('1:30')
    expect(screen.getByText('Speaker')).toBeInTheDocument()
    expect(container.firstChild).not.toHaveClass('is-running', 'is-warning', 'is-expired')
    expect(container.querySelector('.timer-bar-fill')).toHaveStyle({ width: '100%' })
  })
  it('warns at 10s or less and shows running', () => {
    const t = start(createTimer(60), 0)
    const { container } = render(<TimerDisplay timer={t} now={52_000} size="xl" />)
    expect(container.firstChild).toHaveClass('timer-xl', 'is-warning', 'is-running')
    expect(screen.getByRole('timer')).toHaveTextContent('0:08')
  })
  it('is expired at zero', () => {
    const t = start(createTimer(30), 0)
    const { container } = render(<TimerDisplay timer={t} now={40_000} />)
    expect(container.firstChild).toHaveClass('is-expired')
    expect(container.firstChild).not.toHaveClass('is-warning')
    expect(container.querySelector('.timer-bar-fill')).toHaveStyle({ width: '0%' })
  })
  it('progress bar width reflects remaining fraction', () => {
    const t = start(createTimer(100), 0)
    const { container } = render(<TimerDisplay timer={t} now={25_000} />)
    expect(container.querySelector('.timer-bar-fill')).toHaveStyle({ width: '75%' })
  })
})
