import { render, screen } from '@testing-library/react'
import { Placard } from './Placard'

describe('Placard', () => {
  it('renders the flag and the country name', () => {
    const { container } = render(<Placard delegate={{ name: 'Kenya', flag: 'ke' }} />)
    expect(screen.getByText('Kenya')).toHaveClass('placard-name')
    expect(screen.getByRole('img', { name: 'Kenya' })).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass('placard', 'placard-md')
  })
  it('supports the large size', () => {
    const { container } = render(<Placard delegate={{ name: 'Observer', flag: null }} size="lg" />)
    expect(container.firstElementChild).toHaveClass('placard-lg')
    expect(screen.getByText('Observer')).toBeInTheDocument()
  })
})
