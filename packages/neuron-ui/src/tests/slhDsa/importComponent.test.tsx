import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ImportSlhDsaWallet from '../../components/ImportSlhDsaWallet'

const importSlhDsaBackup = vi.fn()
const importSlhDsaWatchOnly = vi.fn()
const importSlhDsaMnemonic = vi.fn()
// vi.mock is hoisted above the imports, so the factories run before the component is loaded.
vi.mock('services/remote', () => ({
  importSlhDsaBackup: (...args: unknown[]) => importSlhDsaBackup(...args),
  importSlhDsaWatchOnly: (...args: unknown[]) => importSlhDsaWatchOnly(...args),
  importSlhDsaMnemonic: (...args: unknown[]) => importSlhDsaMnemonic(...args),
  // Reached through MnemonicInput -> utils -> utils/i18n, which picks the language at import time.
  getLocale: () => 'en',
}))
// Spread over the real module rather than replacing it: this component now reaches utils/i18n
// through MnemonicInput, and that needs the genuine `initReactI18next`.
vi.mock('react-i18next', async importOriginal => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => [(k: string) => k],
}))

const PHRASE_36 = [
  'couple sea spice one east raise place auction leader cluster ceiling crumble',
  'payment earth unit knee erosion truly guide brother upon pool dragon bulk',
  'bid truck approve good neglect casual deer process gloom fatal fun zoo',
].join(' ')

const chooseMnemonicMode = () => {
  fireEvent.click(screen.getByLabelText('slh-dsa.import.from-mnemonic'))
}

const typePhrase = (phrase: string) => {
  const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
  const slots = inputs.filter(input => input.dataset.idx !== undefined)
  phrase.split(' ').forEach((word, index) => {
    fireEvent.change(slots[index], { target: { value: word } })
  })
}

describe('ImportSlhDsaWallet', () => {
  beforeEach(() => {
    importSlhDsaBackup.mockReset()
    importSlhDsaWatchOnly.mockReset()
  })

  it('will not submit without a name and something to import', () => {
    render(<ImportSlhDsaWallet onImported={vi.fn()} />)

    expect(screen.getByText('slh-dsa.import.submit').closest('button')).toBeDisabled()
  })

  it('imports an encrypted backup', async () => {
    importSlhDsaBackup.mockResolvedValue({ status: 1, result: { id: 'w1', name: 'restored' } })
    const onImported = vi.fn()
    render(<ImportSlhDsaWallet onImported={onImported} />)

    // A recovery phrase is now the default route, so the backup one has to be chosen.
    fireEvent.click(screen.getByLabelText('slh-dsa.import.from-backup'))
    fireEvent.change(screen.getByLabelText('slh-dsa.import.name'), { target: { value: 'restored' } })
    fireEvent.change(screen.getByLabelText('slh-dsa.import.backup'), { target: { value: '{"vault":1}' } })
    fireEvent.click(screen.getByText('slh-dsa.import.submit'))

    await waitFor(() => expect(onImported).toHaveBeenCalledWith({ id: 'w1', name: 'restored' }))
    expect(importSlhDsaBackup).toHaveBeenCalledWith({ name: 'restored', backup: '{"vault":1}' })
  })

  it('asks for a parameter set when watching a public key', async () => {
    // The set cannot be recovered from the key or the address, so it has to be stated.
    importSlhDsaWatchOnly.mockResolvedValue({ status: 1, result: { id: 'w2', name: 'watched' } })
    render(<ImportSlhDsaWallet onImported={vi.fn()} />)

    fireEvent.click(screen.getByLabelText(/watch-only/i, { selector: 'input' }))
    fireEvent.change(screen.getByLabelText('slh-dsa.import.name'), { target: { value: 'watched' } })
    fireEvent.change(screen.getByLabelText('slh-dsa.import.public-key'), { target: { value: '0xabcd' } })
    fireEvent.click(screen.getByText('slh-dsa.import.submit'))

    await waitFor(() =>
      expect(importSlhDsaWatchOnly).toHaveBeenCalledWith(
        expect.objectContaining({ publicKey: '0xabcd', parameterSet: 'SLH-DSA-SHA2-128s' })
      )
    )
  })

  it('shows why an import failed rather than silently returning', async () => {
    importSlhDsaBackup.mockResolvedValue({ status: 0, message: { content: 'that vault is corrupt' } })
    const onImported = vi.fn()
    render(<ImportSlhDsaWallet onImported={onImported} />)

    fireEvent.click(screen.getByLabelText('slh-dsa.import.from-backup'))
    fireEvent.change(screen.getByLabelText('slh-dsa.import.name'), { target: { value: 'x' } })
    fireEvent.change(screen.getByLabelText('slh-dsa.import.backup'), { target: { value: 'nonsense' } })
    fireEvent.click(screen.getByText('slh-dsa.import.submit'))

    expect(await screen.findByTestId('import-error')).toHaveTextContent('that vault is corrupt')
    expect(onImported).not.toHaveBeenCalled()
  })
})

describe('ImportSlhDsaWallet from a recovery phrase', () => {
  beforeEach(() => {
    importSlhDsaMnemonic.mockReset()
    importSlhDsaMnemonic.mockResolvedValue({ status: 1, result: { id: 'w1', name: 'restored' } })
  })

  it('offers 36 slots for the default parameter set', () => {
    render(<ImportSlhDsaWallet onImported={vi.fn()} />)
    chooseMnemonicMode()

    const slots = (screen.getAllByRole('textbox') as HTMLInputElement[]).filter(i => i.dataset.idx !== undefined)
    expect(slots).toHaveLength(36)
  })

  it('resizes the grid when the parameter set changes, because 36 words restore a different key', () => {
    render(<ImportSlhDsaWallet onImported={vi.fn()} />)
    chooseMnemonicMode()

    fireEvent.change(screen.getByLabelText('slh-dsa.import.parameter-set'), {
      target: { value: 'SLH-DSA-SHA2-256s' },
    })

    const slots = (screen.getAllByRole('textbox') as HTMLInputElement[]).filter(i => i.dataset.idx !== undefined)
    expect(slots).toHaveLength(72)
  })

  it('will not submit until every slot is filled', () => {
    render(<ImportSlhDsaWallet onImported={vi.fn()} />)
    chooseMnemonicMode()
    fireEvent.change(screen.getByLabelText('slh-dsa.import.name'), { target: { value: 'restored' } })
    fireEvent.change(screen.getByLabelText('slh-dsa.import.password'), { target: { value: 'a-good-password' } })
    fireEvent.change(screen.getByLabelText('slh-dsa.import.confirm'), { target: { value: 'a-good-password' } })

    typePhrase(PHRASE_36.split(' ').slice(0, 35).join(' '))

    expect(screen.getByText('slh-dsa.import.submit').closest('button')).toBeDisabled()
  })

  it('will not submit when the password confirmation does not match', () => {
    render(<ImportSlhDsaWallet onImported={vi.fn()} />)
    chooseMnemonicMode()
    fireEvent.change(screen.getByLabelText('slh-dsa.import.name'), { target: { value: 'restored' } })
    fireEvent.change(screen.getByLabelText('slh-dsa.import.password'), { target: { value: 'a-good-password' } })
    fireEvent.change(screen.getByLabelText('slh-dsa.import.confirm'), { target: { value: 'different' } })
    typePhrase(PHRASE_36)

    expect(screen.getByText('slh-dsa.import.submit').closest('button')).toBeDisabled()
  })

  it('sends the phrase, the parameter set and the password together', async () => {
    const onImported = vi.fn()
    render(<ImportSlhDsaWallet onImported={onImported} />)
    chooseMnemonicMode()
    fireEvent.change(screen.getByLabelText('slh-dsa.import.name'), { target: { value: 'restored' } })
    fireEvent.change(screen.getByLabelText('slh-dsa.import.password'), { target: { value: 'a-good-password' } })
    fireEvent.change(screen.getByLabelText('slh-dsa.import.confirm'), { target: { value: 'a-good-password' } })
    typePhrase(PHRASE_36)

    fireEvent.click(screen.getByText('slh-dsa.import.submit'))

    await waitFor(() =>
      expect(importSlhDsaMnemonic).toHaveBeenCalledWith({
        name: 'restored',
        password: 'a-good-password',
        parameterSet: 'SLH-DSA-SHA2-128s',
        mnemonic: PHRASE_36,
      })
    )
    await waitFor(() => expect(onImported).toHaveBeenCalledWith({ id: 'w1', name: 'restored' }))
  })

  it('surfaces which of the three phrases to re-read', async () => {
    importSlhDsaMnemonic.mockResolvedValue({
      status: 0,
      message: { content: 'Words 13-24 (phrase 2 of 3) are not a valid BIP39 phrase' },
    })
    const onImported = vi.fn()
    render(<ImportSlhDsaWallet onImported={onImported} />)
    chooseMnemonicMode()
    fireEvent.change(screen.getByLabelText('slh-dsa.import.name'), { target: { value: 'restored' } })
    fireEvent.change(screen.getByLabelText('slh-dsa.import.password'), { target: { value: 'a-good-password' } })
    fireEvent.change(screen.getByLabelText('slh-dsa.import.confirm'), { target: { value: 'a-good-password' } })
    typePhrase(PHRASE_36)

    fireEvent.click(screen.getByText('slh-dsa.import.submit'))

    expect(await screen.findByTestId('import-error')).toHaveTextContent('phrase 2 of 3')
    expect(onImported).not.toHaveBeenCalled()
  })
})
