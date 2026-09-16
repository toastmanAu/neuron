import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import MnemonicInput from '../../widgets/MnemonicInput'

// Deliberately no react-i18next mock: MnemonicInput does not translate anything, and mocking the
// module breaks utils/i18n, which it reaches through `useDidMount`.
const phrase = (count: number) => Array.from({ length: count }, (_, i) => `word${i + 1}`).join(' ')

describe('MnemonicInput', () => {
  it('still shows twelve words when no count is given', () => {
    // Every existing caller relies on this default; the widget grew a word count for
    // quantum-resistant wallets, whose phrases are three BIP39 phrases long.
    const { container } = render(
      <MnemonicInput disabled words={phrase(12)} inputsWords={[]} onChangeInputWord={vi.fn()} />
    )

    expect(container.textContent).toContain('word12')
    expect(container.textContent).not.toContain('word13')
  })

  it('shows as many words as it is told to', () => {
    const { container } = render(
      <MnemonicInput disabled wordCount={36} words={phrase(36)} inputsWords={[]} onChangeInputWord={vi.fn()} />
    )

    expect(container.textContent).toContain('word36')
  })

  it('numbers every slot, so a 36 word phrase can be checked against paper', () => {
    const { container } = render(
      <MnemonicInput disabled wordCount={36} words={phrase(36)} inputsWords={[]} onChangeInputWord={vi.fn()} />
    )

    // The last slot carries both its number and its word.
    expect(container.textContent).toContain('36word36')
  })

  it('renders a slot for every position even when the phrase is short', () => {
    // A partly typed phrase must not collapse the grid, or the numbering stops matching the paper.
    render(<MnemonicInput wordCount={36} words="" inputsWords={new Array(36).fill('')} onChangeInputWord={vi.fn()} />)

    expect(screen.getAllByRole('textbox')).toHaveLength(36)
  })
})
