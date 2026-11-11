import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { Delegate } from '../../domain/types'
import { DelegateSelect } from './DelegateSelect'

const D = (id: string, name: string): Delegate => ({ id, name, flag: id, attendance: 'present' })
const delegates = [D('fr', 'France'), D('ci', "Côte d'Ivoire"), D('de', 'Germany'), D('ng', 'Nigeria'), D('in', 'India')]

function Harness({ onChange, exclude, initial = null }: { onChange?: (id: string | null) => void; exclude?: string[]; initial?: string | null }) {
  const [v, setV] = useState<string | null>(initial)
  return (
    <DelegateSelect
      delegates={delegates}
      value={v}
      label="Delegate"
      excludeIds={exclude}
      onChange={(id) => {
        setV(id)
        onChange?.(id)
      }}
    />
  )
}

const names = () => screen.queryAllByRole('option').map((o) => o.textContent)

describe('DelegateSelect', () => {
  it('lists options on focus and filters case/diacritic-insensitively, prefix first', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Delegate' }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(names()).toHaveLength(5)
    await userEvent.type(screen.getByRole('combobox'), 'cote')
    expect(names()).toEqual(["Côte d'Ivoire"])
    await userEvent.clear(screen.getByRole('combobox'))
    await userEvent.type(screen.getByRole('combobox'), 'N')
    expect(names()[0]).toBe('Nigeria')
    expect(names()).toContain('France')
  })
  it('selects with keyboard', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.type(screen.getByRole('combobox'), 'g')
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalled()
    expect(screen.getByRole('combobox')).toHaveValue('Nigeria')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
  it('selects with click', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: /Germany/ }))
    expect(onChange).toHaveBeenCalledWith('de')
    expect(screen.getByRole('combobox')).toHaveValue('Germany')
  })
  it('Escape closes and restores text', async () => {
    render(<Harness initial="fr" />)
    const input = screen.getByRole('combobox')
    await userEvent.click(input)
    await userEvent.type(input, 'xyz')
    await userEvent.keyboard('{Escape}')
    expect(input).toHaveValue('France')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
  it('excludes ids', async () => {
    render(<Harness exclude={['fr', 'de']} />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(names().join()).not.toMatch(/France|Germany/)
    expect(names()).toHaveLength(3)
  })
  it('clears selection', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} initial="fr" />)
    await userEvent.click(screen.getByRole('button', { name: 'Clear Delegate' }))
    expect(onChange).toHaveBeenCalledWith(null)
    expect(screen.getByRole('combobox')).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Clear Delegate' })).not.toBeInTheDocument()
  })
  it('shows No matches', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByRole('combobox'), 'zzz')
    expect(screen.getByText('No matches')).toBeInTheDocument()
  })
})
