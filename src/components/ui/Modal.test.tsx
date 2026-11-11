import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from './Modal'

describe('Modal', () => {
  it('renders title, children and footer', () => {
    render(<Modal title="Hello" onClose={() => {}} footer={<span>foot</span>}>body</Modal>)
    expect(screen.getByRole('dialog', { name: 'Hello' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('body')).toBeInTheDocument()
    expect(screen.getByText('foot')).toBeInTheDocument()
  })
  it('focuses the panel on mount', () => {
    render(<Modal title="T" onClose={() => {}}>b</Modal>)
    expect(screen.getByRole('dialog')).toHaveFocus()
  })
  it('closes on Escape, close button and overlay click', async () => {
    const onClose = vi.fn()
    render(<Modal title="T" onClose={onClose}>b</Modal>)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    await userEvent.click(screen.getByTestId('modal-overlay'))
    expect(onClose).toHaveBeenCalledTimes(3)
  })
  it('does not close when clicking inside', async () => {
    const onClose = vi.fn()
    render(<Modal title="T" onClose={onClose}>inside</Modal>)
    await userEvent.click(screen.getByText('inside'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
