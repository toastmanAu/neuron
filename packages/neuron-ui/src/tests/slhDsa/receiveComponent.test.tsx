import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SlhDsaReceive from '../../components/SlhDsaReceive'

// jsdom implements no canvas, and the QR rendering is not what these tests assert.
vi.mock('widgets/QRCode', () => ({ __esModule: true, default: () => null }))

const getSlhDsaAddresses = vi.fn()

vi.mock('services/remote', () => ({
  getSlhDsaAddresses: (...a: unknown[]) => getSlhDsaAddresses(...a),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => [(k: string) => k] }))

const address: Controller.SlhDsaAddress = {
  address: 'ckt1qq6pngwqn6e9vlm92th8w7cvcsuqhf9pvpm0hkzr',
  lockCodeHash: `0x${'a1'.repeat(32)}`,
  lockHashType: 'data1',
  lockArgs: `0x${'11'.repeat(32)}`,
  addressType: 0,
  addressIndex: 0,
  parameterSet: 'SLH-DSA-SHA2-256s',
  watchOnly: false,
}

describe('SlhDsaReceive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSlhDsaAddresses.mockResolvedValue({ status: 1, result: [address] })
  })

  it('shows the address to receive to', async () => {
    render(<SlhDsaReceive walletId="w1" />)

    expect(await screen.findByTestId('address')).toHaveTextContent(address.address)
  })

  it('shows the parameter set, which the address alone cannot reveal', async () => {
    // The lock args are a hash of the parameter set and public key, so the set is not recoverable
    // from the address. If it is not shown here it is not visible anywhere.
    render(<SlhDsaReceive walletId="w1" />)

    expect(await screen.findByTestId('parameter-set')).toHaveTextContent('SLH-DSA-SHA2-256s')
  })

  it('says the address is network specific', async () => {
    // The lock is deployed under a different code hash on mainnet and testnet, so the same key
    // produces a different address on each. Sending mainnet funds to a testnet address is a
    // permanent loss, and nothing in the address string warns about it.
    render(<SlhDsaReceive walletId="w1" />)

    expect(await screen.findByTestId('network-note')).toBeInTheDocument()
  })

  it('marks a watch-only wallet as unable to spend', async () => {
    getSlhDsaAddresses.mockResolvedValue({ status: 1, result: [{ ...address, watchOnly: true }] })
    render(<SlhDsaReceive walletId="w1" />)

    expect(await screen.findByTestId('watch-only')).toBeInTheDocument()
  })

  it('does not claim watch-only for a spendable wallet', async () => {
    render(<SlhDsaReceive walletId="w1" />)
    await screen.findByTestId('address')

    expect(screen.queryByTestId('watch-only')).not.toBeInTheDocument()
  })

  it('surfaces a failure rather than showing a blank address', async () => {
    getSlhDsaAddresses.mockResolvedValue({ status: 0, message: { content: 'no vault' } })
    render(<SlhDsaReceive walletId="w1" />)

    expect(await screen.findByTestId('receive-error')).toHaveTextContent('no vault')
    expect(screen.queryByTestId('address')).not.toBeInTheDocument()
  })

  it('copies the address when the copy zone is clicked', async () => {
    // Reported from the running app: the address was plain text with no way to copy it, while the
    // secp receive view has had a copy zone and QR code all along. A quantum-resistant address is
    // over a hundred characters, so retyping it is not a realistic fallback.
    const writeText = vi.fn()
    Object.assign(window.navigator, { clipboard: { writeText } })
    getSlhDsaAddresses.mockResolvedValue({ status: 1, result: [address] })
    render(<SlhDsaReceive walletId="w1" />)

    const shown = await screen.findByTestId('address')
    fireEvent.click(shown)

    expect(writeText).toHaveBeenCalledWith(address.address)
  })
})
