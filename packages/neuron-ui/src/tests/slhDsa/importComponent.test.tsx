import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ImportSlhDsaWallet from '../../components/ImportSlhDsaWallet'

const importSlhDsaBackup = vi.fn()
const importSlhDsaWatchOnly = vi.fn()
// vi.mock is hoisted above the imports, so the factories run before the component is loaded.
vi.mock('services/remote', () => ({
  importSlhDsaBackup: (...args: unknown[]) => importSlhDsaBackup(...args),
  importSlhDsaWatchOnly: (...args: unknown[]) => importSlhDsaWatchOnly(...args),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => [(k: string) => k] }))

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

    fireEvent.change(screen.getByLabelText('slh-dsa.import.name'), { target: { value: 'x' } })
    fireEvent.change(screen.getByLabelText('slh-dsa.import.backup'), { target: { value: 'nonsense' } })
    fireEvent.click(screen.getByText('slh-dsa.import.submit'))

    expect(await screen.findByTestId('import-error')).toHaveTextContent('that vault is corrupt')
    expect(onImported).not.toHaveBeenCalled()
  })
})
