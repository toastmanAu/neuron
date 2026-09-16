import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import FiberEndpointForm from '../../components/FiberStatus/endpoint'

const fiberGetEndpoint = vi.fn()
const fiberSetEndpoint = vi.fn()
const fiberClearEndpoint = vi.fn()
// vi.mock is hoisted above the imports, so the factories run before the component is loaded.
vi.mock('services/remote', () => ({
  fiberGetEndpoint: () => fiberGetEndpoint(),
  fiberSetEndpoint: (...a: unknown[]) => fiberSetEndpoint(...a),
  fiberClearEndpoint: () => fiberClearEndpoint(),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => [(k: string) => k] }))

describe('FiberEndpointForm', () => {
  beforeEach(() => {
    fiberGetEndpoint.mockReset()
    fiberSetEndpoint.mockReset()
    fiberClearEndpoint.mockReset()
    fiberGetEndpoint.mockResolvedValue({ status: 1, result: { url: '', hasToken: false } })
    fiberSetEndpoint.mockResolvedValue({ status: 1 })
    fiberClearEndpoint.mockResolvedValue({ status: 1 })
  })

  it('saves a node address', async () => {
    const onChanged = vi.fn()
    render(<FiberEndpointForm onChanged={onChanged} />)

    fireEvent.change(screen.getByTestId('fiber-url'), { target: { value: 'http://127.0.0.1:8231' } })
    fireEvent.click(screen.getByText('fiber.endpoint.save'))

    await waitFor(() => expect(fiberSetEndpoint).toHaveBeenCalledWith({ url: 'http://127.0.0.1:8231' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('sends the token only when one was typed', async () => {
    // An untouched field means "keep what is stored", not "clear it". Sending an empty token would
    // silently drop the credential of a node that needs one.
    render(<FiberEndpointForm onChanged={vi.fn()} />)

    fireEvent.change(screen.getByTestId('fiber-url'), { target: { value: 'http://node' } })
    fireEvent.click(screen.getByText('fiber.endpoint.save'))

    await waitFor(() => expect(fiberSetEndpoint).toHaveBeenCalledWith({ url: 'http://node' }))
    expect(fiberSetEndpoint.mock.calls[0][0]).not.toHaveProperty('token')
  })

  it('never displays a stored token, only that one is held', async () => {
    // The main process does not send the token to the renderer, and this must not imply otherwise.
    fiberGetEndpoint.mockResolvedValue({ status: 1, result: { url: 'http://node', hasToken: true } })
    render(<FiberEndpointForm onChanged={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('fiber-url')).toHaveValue('http://node'))
    expect(screen.getByTestId('fiber-token')).toHaveValue('')
    expect(screen.getByTestId('token-note')).toHaveTextContent('fiber.endpoint.token-held')
  })

  it('masks the token field', async () => {
    render(<FiberEndpointForm onChanged={vi.fn()} />)

    expect(screen.getByTestId('fiber-token')).toHaveAttribute('type', 'password')
  })

  it('clears the endpoint on request', async () => {
    fiberGetEndpoint.mockResolvedValue({ status: 1, result: { url: 'http://node', hasToken: true } })
    const onChanged = vi.fn()
    render(<FiberEndpointForm onChanged={onChanged} />)

    await waitFor(() => expect(screen.getByTestId('fiber-url')).toHaveValue('http://node'))
    fireEvent.click(screen.getByText('fiber.endpoint.clear'))

    await waitFor(() => expect(fiberClearEndpoint).toHaveBeenCalled())
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('surfaces a failure rather than appearing to succeed', async () => {
    fiberSetEndpoint.mockResolvedValue({ status: 0, message: { content: 'that address is not a URL' } })
    const onChanged = vi.fn()
    render(<FiberEndpointForm onChanged={onChanged} />)

    fireEvent.change(screen.getByTestId('fiber-url'), { target: { value: 'nonsense' } })
    fireEvent.click(screen.getByText('fiber.endpoint.save'))

    expect(await screen.findByTestId('endpoint-error')).toHaveTextContent('that address is not a URL')
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('will not save without an address', () => {
    render(<FiberEndpointForm onChanged={vi.fn()} />)

    expect(screen.getByText('fiber.endpoint.save').closest('button')).toBeDisabled()
  })
})
