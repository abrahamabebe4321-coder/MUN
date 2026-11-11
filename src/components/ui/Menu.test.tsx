import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Menu } from './Menu'
import { Modal } from './Modal'

const make = (over: Partial<Parameters<typeof Menu>[0]> = {}) => {
  const a = vi.fn()
  const b = vi.fn()
  const c = vi.fn()
  render(
    <div>
      <button>outside</button>
      <Menu
        label="More"
        items={[
          { label: 'One', onSelect: a, hint: 'O' },
          { label: 'Two', onSelect: b, disabled: true },
          { label: 'Three', onSelect: c, danger: true },
        ]}
        {...over}
      />
    </div>,
  )
  return { a, b, c }
}

describe('Menu', () => {
  it('is closed initially with aria attributes on the button', () => {
    make()
    const btn = screen.getByRole('button', { name: 'More' })
    expect(btn).toHaveAttribute('aria-haspopup', 'menu')
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).toBeNull()
  })
  it('opens, focuses first enabled item and selects', async () => {
    const { a } = make()
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu', { name: 'More' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /One/ })).toHaveFocus()
    expect(screen.getByRole('menuitem', { name: /Three/ })).toHaveClass('is-danger')
    await userEvent.keyboard('{Enter}')
    expect(a).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'More' })).toHaveFocus()
  })
  it('cycles with arrows, skipping disabled, and Home/End', async () => {
    make()
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Three' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: /One/ })).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Three' })).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(screen.getByRole('menuitem', { name: /One/ })).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('menuitem', { name: 'Three' })).toHaveFocus()
  })
  it('does not select disabled items', async () => {
    const { b } = make()
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByRole('menuitem', { name: 'Two' })).toBeDisabled()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Two' }))
    expect(b).not.toHaveBeenCalled()
  })
  it('closes on Escape and returns focus', async () => {
    make()
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'More' })).toHaveFocus()
  })
  it('closes on outside click', async () => {
    make()
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    await userEvent.click(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByRole('menu')).toBeNull()
  })
  it('Escape does not also close an enclosing modal', async () => {
    const onClose = vi.fn()
    render(
      <Modal title="Dialog" onClose={onClose}>
        <Menu label="More" items={[{ label: 'One', onSelect: () => {} }]} />
      </Modal>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    await userEvent.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('renders custom button content but keeps the accessible name', () => {
    make({ children: <span>⋯</span> })
    expect(screen.getByRole('button', { name: 'More' })).toHaveTextContent('⋯')
  })
})
