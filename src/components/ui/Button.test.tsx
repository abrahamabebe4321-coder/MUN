import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

describe('Button', () => {
  it('defaults to secondary md and type button', () => {
    render(<Button>Go</Button>)
    const b = screen.getByRole('button', { name: 'Go' })
    expect(b).toHaveClass('btn', 'btn-secondary', 'btn-md')
    expect(b).toHaveAttribute('type', 'button')
  })
  it('applies variant, size and className', () => {
    render(<Button variant="danger" size="lg" className="x">Del</Button>)
    expect(screen.getByRole('button')).toHaveClass('btn-danger', 'btn-lg', 'x')
  })
  it('allows type override and handles click', async () => {
    const fn = vi.fn()
    render(<Button type="submit" onClick={fn}>S</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(fn).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })
})
