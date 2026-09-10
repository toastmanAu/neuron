import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fiberGetEndpoint, fiberSetEndpoint, fiberClearEndpoint } from 'services/remote'
import type { ControllerResponse, SuccessFromController } from 'services/remote/remoteApiWrapper'

// A type predicate, so the response union actually narrows.
const isSuccess = <R,>(res: ControllerResponse<R>): res is SuccessFromController<R> => res.status === 1

export interface FiberEndpointFormProps {
  /** Called after the endpoint changes, so the panel can re-check the node. */
  onChanged: () => void
}

/**
 * Configure which Fiber node Neuron talks to.
 *
 * The panel could report that no node was configured and told the user to set one in settings, but
 * no such setting existed anywhere in the application — the instruction pointed at nothing.
 *
 * The auth token is write-only by design. The main process never sends it to the renderer, so this
 * cannot display the current one; it reports only whether a token is held. An empty token field
 * therefore means "leave whatever is stored alone", not "clear it".
 */
const FiberEndpointForm = ({ onChanged }: FiberEndpointFormProps) => {
  const [t] = useTranslation()
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [hasToken, setHasToken] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    fiberGetEndpoint().then(res => {
      if (isSuccess(res) && res.result) {
        setUrl(res.result.url)
        setHasToken(res.result.hasToken)
      }
    })
  }, [])

  useEffect(load, [load])

  const save = useCallback(async () => {
    setError('')
    setBusy(true)
    try {
      // An untouched token field leaves the stored one in place rather than wiping it.
      const res = await fiberSetEndpoint(token ? { url, token } : { url })
      if (!isSuccess(res)) {
        const { message } = res as { message?: string | { content?: string } }
        setError(typeof message === 'string' ? message : message?.content ?? t('fiber.endpoint.failed'))
        return
      }
      setToken('')
      load()
      onChanged()
    } finally {
      setBusy(false)
    }
  }, [url, token, load, onChanged, t])

  const clear = useCallback(async () => {
    setBusy(true)
    try {
      await fiberClearEndpoint()
      setUrl('')
      setToken('')
      setHasToken(false)
      onChanged()
    } finally {
      setBusy(false)
    }
  }, [onChanged])

  return (
    <div>
      <h3>{t('fiber.endpoint.title')}</h3>

      <label htmlFor="fiber-url">{t('fiber.endpoint.url')}</label>
      <input id="fiber-url" value={url} placeholder="http://127.0.0.1:8227" onChange={e => setUrl(e.target.value)} />

      <label htmlFor="fiber-token">{t('fiber.endpoint.token')}</label>
      <input
        id="fiber-token"
        type="password"
        value={token}
        autoComplete="off"
        placeholder={hasToken ? t('fiber.endpoint.token-held') : ''}
        onChange={e => setToken(e.target.value)}
      />
      <p data-testid="token-note">{t(hasToken ? 'fiber.endpoint.token-held' : 'fiber.endpoint.token-optional')}</p>

      {error ? <p data-testid="endpoint-error">{error}</p> : null}

      <button type="button" disabled={!url || busy} onClick={save}>
        {t('fiber.endpoint.save')}
      </button>
      <button type="button" disabled={busy || !url} onClick={clear}>
        {t('fiber.endpoint.clear')}
      </button>
    </div>
  )
}

FiberEndpointForm.displayName = 'FiberEndpointForm'

export default FiberEndpointForm
