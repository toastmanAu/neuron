import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CreateSlhDsaWallet from '../../components/CreateSlhDsaWallet'

const createSlhDsaWallet = vi.fn()
const getSlhDsaParameterSets = vi.fn()

// vi.mock is hoisted above the imports, so the factories run before the component is loaded.
vi.mock('services/remote', () => ({
  createSlhDsaWallet: (...a: unknown[]) => createSlhDsaWallet(...a),
  getSlhDsaParameterSets: (...a: unknown[]) => getSlhDsaParameterSets(...a),
}))
// Neuron destructures the array form: const [t] = useTranslation()
vi.mock('react-i18next', () => ({ useTranslation: () => [(k: string) => k] }))

const SETS: Controller.SlhDsaParameterSetSummary[] = [
  { name: 'SLH-DSA-SHA2-256s', publicKeyLength: 64, signatureLength: 29792, witnessSize: 29889, slowSigning: false },
  { name: 'SLH-DSA-SHA2-128s', publicKeyLength: 32, signatureLength: 7856, witnessSize: 7921, slowSigning: false },
  { name: 'SLH-DSA-SHAKE-256s', publicKeyLength: 64, signatureLength: 29792, witnessSize: 29889, slowSigning: true },
]

describe('CreateSlhDsaWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSlhDsaParameterSets.mockResolvedValue({ status: 1, result: SETS })
    createSlhDsaWallet.mockResolvedValue({ status: 1, result: { id: 'w1', name: 'pq', addresses: [] } })
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

    fireEvent.change(screen.getByTestId('name'), { target: { value: 'pq' } })
    fireEvent.change(screen.getByTestId('password'), { target: { value: 'a-good-password' } })
    fireEvent.change(screen.getByTestId('confirm'), { target: { value: 'a-good-password' } })
    fireEvent.click(screen.getByTestId('submit'))

    await waitFor(() =>
      expect(createSlhDsaWallet).toHaveBeenCalledWith({
        name: 'pq',
        password: 'a-good-password',
        parameterSet: 'SLH-DSA-SHA2-256s',
      })
    )
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: 'w1', name: 'pq', addresses: [] }))
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

    fireEvent.change(screen.getByTestId('name'), { target: { value: 'pq' } })
    fireEvent.change(screen.getByTestId('password'), { target: { value: 'a-good-password' } })
    fireEvent.change(screen.getByTestId('confirm'), { target: { value: 'a-good-password' } })
    fireEvent.click(screen.getByTestId('submit'))

    expect(await screen.findByTestId('create-error')).toHaveTextContent('disk full')
    expect(onCreated).not.toHaveBeenCalled()
  })
})
