import { render, screen } from '@testing-library/react'
import { DelegateChip } from './DelegateChip'

describe('DelegateChip', () => {
  it('renders flag and name', () => {
    const { container } = render(<DelegateChip delegate={{ name: 'France', flag: 'fr' }} />)
    expect(screen.getByText('France')).toBeInTheDocument()
    expect(container.querySelector('.fi-fr')).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('chip')
  })
  it('muted variant', () => {
    const { container } = render(<DelegateChip delegate={{ name: 'X', flag: null }} muted />)
    expect(container.firstChild).toHaveClass('chip-muted')
  })
})
