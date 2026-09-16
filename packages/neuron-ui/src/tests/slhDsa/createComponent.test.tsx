import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import CreateSlhDsaWallet from '../../components/CreateSlhDsaWallet'

const createSlhDsaWallet = vi.fn()
const getSlhDsaParameterSets = vi.fn()

// vi.mock is hoisted above the imports, so the factories run before the component is loaded.
vi.mock('services/remote', () => ({
  createSlhDsaWallet: (...a: unknown[]) => createSlhDsaWallet(...a),
  getSlhDsaParameterSets: (...a: unknown[]) => getSlhDsaParameterSets(...a),
  // Reached through MnemonicInput -> utils -> utils/i18n, which picks the language at import time.
  getLocale: () => 'en',
}))
// Neuron destructures the array form: const [t] = useTranslation(). Spread over the real module
// rather than replacing it: this component now reaches utils/i18n through MnemonicInput, and that
// needs the genuine `initReactI18next`.
vi.mock('react-i18next', async importOriginal => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => [(k: string) => k],
}))

const SETS: Controller.SlhDsaParameterSetSummary[] = [
  { name: 'SLH-DSA-SHA2-256s', publicKeyLength: 64, signatureLength: 29792, witnessSize: 29889, slowSigning: false },
  { name: 'SLH-DSA-SHA2-128s', publicKeyLength: 32, signatureLength: 7856, witnessSize: 7921, slowSigning: false },
  { name: 'SLH-DSA-SHAKE-256s', publicKeyLength: 64, signatureLength: 29792, witnessSize: 29889, slowSigning: true },
]

// 36 real BIP39 words: three 12 word phrases. The component does not validate them, but the verify
// step compares what the user types against them, so they have to be distinguishable.
const MNEMONIC = [
  'couple sea spice one east raise place auction leader cluster ceiling crumble',
  'payment earth unit knee erosion truly guide brother upon pool dragon bulk',
  'bid truck approve good neglect casual deer process gloom fatal fun zoo',
].join(' ')

const fillForm = () => {
  fireEvent.change(screen.getByTestId('name'), { target: { value: 'pq' } })
  fireEvent.change(screen.getByTestId('password'), { target: { value: 'a-good-password' } })
  fireEvent.change(screen.getByTestId('confirm'), { target: { value: 'a-good-password' } })
  fireEvent.click(screen.getByTestId('submit'))
}

describe('CreateSlhDsaWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSlhDsaParameterSets.mockResolvedValue({ status: 1, result: SETS })
    createSlhDsaWallet.mockResolvedValue({
      status: 1,
      result: { id: 'w1', name: 'pq', addresses: [], mnemonic: MNEMONIC },
    })
  })

  it('offers the recommended parameter set without making the user choose', async () => {
    render(<CreateSlhDsaWallet onCreated={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('parameter-set')).toHaveTextContent('SLH-DSA-SHA2-256s'))
    // The other sets exist but are not in the way.
    expect(screen.queryByTestId('advanced-parameter-sets')).not.toBeInTheDocument()
  })

  it('reveals every other set under advanced, so the choice is real', async () => {
    render(<CreateSlhDsaWallet onCreated={vi.fn()} />)
    await waitFor(() => screen.getByTestId('parameter-set'))

    fireEvent.click(screen.getByTestId('toggle-advanced'))

    const advanced = await screen.findByTestId('advanced-parameter-sets')
    expect(advanced).toHaveTextContent('SLH-DSA-SHA2-128s')
    expect(advanced).toHaveTextContent('SLH-DSA-SHAKE-256s')
  })

  it('warns before a set that is slow to sign', async () => {
    render(<CreateSlhDsaWallet onCreated={vi.fn()} />)
    await waitFor(() => screen.getByTestId('parameter-set'))
    fireEvent.click(screen.getByTestId('toggle-advanced'))
    fireEvent.click(await screen.findByTestId('select-SLH-DSA-SHAKE-256s'))

    expect(await screen.findByTestId('slow-signing-warning')).toBeInTheDocument()
  })

  it('shows what each signature will cost on chain', async () => {
    render(<CreateSlhDsaWallet onCreated={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('witness-cost')).toHaveTextContent('29.2 KB'))
  })

  it('will not submit without a name and a password', async () => {
    render(<CreateSlhDsaWallet onCreated={vi.fn()} />)
    await waitFor(() => screen.getByTestId('parameter-set'))

    expect(screen.getByTestId('submit')).toBeDisabled()
  })

  it('will not submit when the confirmation does not match', async () => {
    render(<CreateSlhDsaWallet onCreated={vi.fn()} />)
    await waitFor(() => screen.getByTestId('parameter-set'))

    fireEvent.change(screen.getByTestId('name'), { target: { value: 'pq' } })
    fireEvent.change(screen.getByTestId('password'), { target: { value: 'a-good-password' } })
    fireEvent.change(screen.getByTestId('confirm'), { target: { value: 'different' } })

    expect(screen.getByTestId('submit')).toBeDisabled()
  })

  it('creates the wallet with the chosen set and never echoes the password back', async () => {
    const onCreated = vi.fn()
    render(<CreateSlhDsaWallet onCreated={onCreated} />)
    await waitFor(() => screen.getByTestId('parameter-set'))

    fillForm()

    await waitFor(() =>
      expect(createSlhDsaWallet).toHaveBeenCalledWith({
        name: 'pq',
        password: 'a-good-password',
        parameterSet: 'SLH-DSA-SHA2-256s',
      })
    )
  })

  it('keeps the password in masked fields and out of the rest of the page', async () => {
    // A controlled input necessarily holds its own value; what matters is that it is masked and
    // that the password is not echoed anywhere else in the document.
    render(<CreateSlhDsaWallet onCreated={vi.fn()} />)
    await waitFor(() => screen.getByTestId('parameter-set'))

    fireEvent.change(screen.getByTestId('password'), { target: { value: 'a-good-password' } })
    fireEvent.change(screen.getByTestId('confirm'), { target: { value: 'a-good-password' } })

    expect(screen.getByTestId('password')).toHaveAttribute('type', 'password')
    expect(screen.getByTestId('confirm')).toHaveAttribute('type', 'password')

    const elsewhere = document.body.innerHTML.replace(/<input[^>]*type="password"[^>]*>/g, '')
    expect(elsewhere).not.toContain('a-good-password')
  })

  it('warns that signing takes seconds, because the app will appear to hang', async () => {
    // Signing runs in the main process and takes ~3s for the recommended set. Saying so up front is
    // the difference between "working" and "frozen".
    render(<CreateSlhDsaWallet onCreated={vi.fn()} />)

    expect(await screen.findByTestId('signing-time-note')).toBeInTheDocument()
  })

  it('surfaces a failure instead of pretending it worked', async () => {
    createSlhDsaWallet.mockResolvedValue({ status: 0, message: { content: 'disk full' } })
    const onCreated = vi.fn()
    render(<CreateSlhDsaWallet onCreated={onCreated} />)
    await waitFor(() => screen.getByTestId('parameter-set'))

    fillForm()

    expect(await screen.findByTestId('create-error')).toHaveTextContent('disk full')
    expect(onCreated).not.toHaveBeenCalled()
  })
})

describe('CreateSlhDsaWallet recovery phrase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSlhDsaParameterSets.mockResolvedValue({ status: 1, result: SETS })
    createSlhDsaWallet.mockResolvedValue({
      status: 1,
      result: { id: 'w1', name: 'pq', addresses: [], mnemonic: MNEMONIC },
    })
  })

  const reveal = async () => {
    render(<CreateSlhDsaWallet onCreated={vi.fn()} />)
    await waitFor(() => screen.getByTestId('parameter-set'))
    fillForm()
    return screen.findByTestId('recovery-phrase')
  }

  it('shows the phrase before the wallet is handed over', async () => {
    const phrase = await reveal()

    expect(phrase).toHaveTextContent('couple')
    expect(phrase).toHaveTextContent('zoo')
  })

  it('shows all 36 words, not the 12 a secp wallet has', async () => {
    // The whole point of the change: a SPHINCS+ master seed is three BIP39 phrases, and a 12 word
    // backup would restore a third of the key.
    const phrase = await reveal()

    MNEMONIC.split(' ').forEach(word => expect(phrase).toHaveTextContent(word))
  })

  it('does not finish until the user has been through the phrase', async () => {
    const onCreated = vi.fn()
    render(<CreateSlhDsaWallet onCreated={onCreated} />)
    await waitFor(() => screen.getByTestId('parameter-set'))
    fillForm()

    await screen.findByTestId('recovery-phrase')
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('asks the user to replace words it blanked out, the way the secp wizard does', async () => {
    await reveal()

    fireEvent.click(screen.getByTestId('phrase-continue'))

    const verify = await screen.findByTestId('verify-phrase')
    // Exactly three slots are left to fill; the rest are masked and disabled.
    const enabled = within(verify)
      .getAllByRole('textbox')
      .filter(input => !(input as HTMLInputElement).disabled)
    expect(enabled).toHaveLength(3)
  })

  it('will not finish while a replaced word is wrong', async () => {
    const onCreated = vi.fn()
    render(<CreateSlhDsaWallet onCreated={onCreated} />)
    await waitFor(() => screen.getByTestId('parameter-set'))
    fillForm()
    await screen.findByTestId('recovery-phrase')
    fireEvent.click(screen.getByTestId('phrase-continue'))

    const verify = await screen.findByTestId('verify-phrase')
    const enabled = within(verify)
      .getAllByRole('textbox')
      .filter(input => !(input as HTMLInputElement).disabled) as HTMLInputElement[]
    // The element already carries data-idx; `dataset` is read-only and cannot be set through the
    // event init.
    fireEvent.change(enabled[0], { target: { value: 'wrong' } })

    expect(screen.getByTestId('verify-continue')).toBeDisabled()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('finishes once every blank is right', async () => {
    const onCreated = vi.fn()
    render(<CreateSlhDsaWallet onCreated={onCreated} />)
    await waitFor(() => screen.getByTestId('parameter-set'))
    fillForm()
    await screen.findByTestId('recovery-phrase')
    fireEvent.click(screen.getByTestId('phrase-continue'))

    const verify = await screen.findByTestId('verify-phrase')
    const words = MNEMONIC.split(' ')
    const enabled = within(verify)
      .getAllByRole('textbox')
      .filter(input => !(input as HTMLInputElement).disabled) as HTMLInputElement[]
    enabled.forEach(input => {
      fireEvent.change(input, { target: { value: words[Number(input.dataset.idx)] } })
    })

    await waitFor(() => expect(screen.getByTestId('verify-continue')).toBeEnabled())
    fireEvent.click(screen.getByTestId('verify-continue'))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: 'w1', name: 'pq', addresses: [] }))
  })

  it('does not hand the phrase on to the rest of the app', async () => {
    // Everything past creation works from the wallet record; the phrase has no reason to travel
    // further, and passing it on is a second copy of the wallet in application state.
    const onCreated = vi.fn()
    render(<CreateSlhDsaWallet onCreated={onCreated} />)
    await waitFor(() => screen.getByTestId('parameter-set'))
    fillForm()
    await screen.findByTestId('recovery-phrase')
    fireEvent.click(screen.getByTestId('phrase-continue'))

    const verify = await screen.findByTestId('verify-phrase')
    const words = MNEMONIC.split(' ')
    const enabled = within(verify)
      .getAllByRole('textbox')
      .filter(input => !(input as HTMLInputElement).disabled) as HTMLInputElement[]
    enabled.forEach(input => {
      fireEvent.change(input, { target: { value: words[Number(input.dataset.idx)] } })
    })
    await waitFor(() => expect(screen.getByTestId('verify-continue')).toBeEnabled())
    fireEvent.click(screen.getByTestId('verify-continue'))

    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(JSON.stringify(onCreated.mock.calls)).not.toContain('couple')
  })
})
