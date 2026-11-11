import { render, screen } from '@testing-library/react'
import { Flag } from './Flag'

describe('Flag', () => {
  it('renders a flag with accessible name', () => {
    render(<Flag code="et" />)
    const el = screen.getByRole('img', { name: 'Ethiopia' })
    expect(el.className).toContain('fi-et')
  })
  it('renders a placeholder for null', () => {
    const { container } = render(<Flag code={null} />)
    const el = container.querySelector('.flag-placeholder')
    expect(el).not.toBeNull()
    expect(el?.getAttribute('aria-hidden')).toBe('true')
  })
})
