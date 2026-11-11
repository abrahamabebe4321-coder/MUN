import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimeInput } from './TimeInput'

describe('TimeInput', () => {
  it('shows m:ss', () => {
    render(<TimeInput seconds={90} onChange={() => {}} label="Speaker time" />)
    expect(screen.getByLabelText('Speaker time')).toHaveValue('1:30')
  })
  it('commits on Enter', async () => {
    const onChange = vi.fn()
    render(<TimeInput seconds={90} onChange={onChange} label="T" />)
    const input = screen.getByLabelText('T')
    await userEvent.clear(input)
    await userEvent.type(input, '2:00{Enter}')
    expect(onChange).toHaveBeenCalledWith(120)
  })
  it('flags invalid text and reverts on blur', async () => {
    const onChange = vi.fn()
    render(<TimeInput seconds={90} onChange={onChange} label="T" />)
    const input = screen.getByLabelText('T')
    await userEvent.clear(input)
    await userEvent.type(input, 'abc')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    await userEvent.tab()
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('1:30')
    expect(input).not.toHaveAttribute('aria-invalid')
  })
  it('does not call onChange when unchanged', async () => {
    const onChange = vi.fn()
    render(<TimeInput seconds={90} onChange={onChange} label="T" />)
    await userEvent.type(screen.getByLabelText('T'), '{Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })
  it('preset click', async () => {
    const onChange = vi.fn()
    render(<TimeInput seconds={90} onChange={onChange} label="T" presets={[30, 60]} />)
    await userEvent.click(screen.getByRole('button', { name: '0:30' }))
    expect(onChange).toHaveBeenCalledWith(30)
  })
})
