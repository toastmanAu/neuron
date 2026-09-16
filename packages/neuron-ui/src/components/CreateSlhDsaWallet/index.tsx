import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createSlhDsaWallet, getSlhDsaParameterSets } from 'services/remote'
import { RECOMMENDED_PARAMETER_SET, describeParameterSet, formatWitnessCost, groupParameterSets } from 'utils/slhDsa'
import MnemonicInput from 'widgets/MnemonicInput'
import { useInputWords } from 'components/WalletWizard/hooks'
import type { ControllerResponse, SuccessFromController } from 'services/remote/remoteApiWrapper'

/** How many words the verify step blanks out, matching the secp wizard. */
const WORDS_TO_VERIFY = 3

const pickBlankIndexes = (wordCount: number): number[] => {
  const chosen = new Set<number>()
  while (chosen.size < WORDS_TO_VERIFY) {
    chosen.add(Math.floor(Math.random() * wordCount))
  }
  return [...chosen]
}

// A type predicate, so the response union actually narrows. Without `res is ...` the
// compiler keeps both arms and `result` does not exist on the failure one.
const isSuccess = <R,>(res: ControllerResponse<R>): res is SuccessFromController<R> => res.status === 1

export interface CreatedSlhDsaWallet {
  id: string
  name: string
  addresses: Controller.SlhDsaAddress[]
}

export interface CreateSlhDsaWalletProps {
  onCreated: (wallet: CreatedSlhDsaWallet) => void
}

/**
 * Create a quantum-resistant wallet.
 *
 * Two things are surfaced that a secp wallet never has to mention, because both change what the
 * user experiences: every signature is kilobytes rather than 65 bytes, and signing takes seconds
 * rather than milliseconds. Saying so before the wallet exists is cheaper than explaining it after.
 */
const CreateSlhDsaWallet = ({ onCreated }: CreateSlhDsaWalletProps) => {
  const [t] = useTranslation()
  const [sets, setSets] = useState<Controller.SlhDsaParameterSetSummary[]>([])
  const [selected, setSelected] = useState<string>(RECOMMENDED_PARAMETER_SET)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // The wallet exists on disk from the moment `createSlhDsaWallet` returns; these three steps are
  // about getting the phrase onto paper before the user moves on, not about creating anything.
  const [step, setStep] = useState<'form' | 'reveal' | 'verify'>('form')
  const [mnemonic, setMnemonic] = useState('')
  const [created, setCreated] = useState<CreatedSlhDsaWallet | undefined>()
  const [blankIndexes, setBlankIndexes] = useState<number[]>([])

  const wordCount = useMemo(() => mnemonic.split(' ').filter(Boolean).length, [mnemonic])
  const { inputsWords, onChangeInput, setInputsWords } = useInputWords(wordCount || undefined)

  useEffect(() => {
    getSlhDsaParameterSets().then(res => {
      if (isSuccess(res) && res.result) {
        setSets(res.result)
        const { recommended } = groupParameterSets(res.result)
        setSelected(recommended.name)
      }
    })
  }, [])

  const grouped = useMemo(() => (sets.length ? groupParameterSets(sets) : undefined), [sets])
  const current = useMemo(() => sets.find(s => s.name === selected), [sets, selected])
  const description = current ? describeParameterSet(current) : undefined

  const canSubmit = Boolean(name && password && password === confirm && !busy)

  const submit = useCallback(async () => {
    setError('')
    setBusy(true)
    try {
      const res = await createSlhDsaWallet({ name, password, parameterSet: selected })
      if (isSuccess(res) && res.result) {
        const { mnemonic: phrase, ...wallet } = res.result
        setMnemonic(phrase)
        setCreated(wallet)
        setStep('reveal')
        return
      }
      const { message } = res as { message?: string | { content?: string } }
      setError(typeof message === 'string' ? message : message?.content ?? 'Could not create the wallet')
    } finally {
      setBusy(false)
    }
  }, [name, password, selected])

  const startVerifying = useCallback(() => {
    const words = mnemonic.split(' ')
    const blanks = pickBlankIndexes(words.length)
    setBlankIndexes(blanks)
    setInputsWords(words.map((word, index) => (blanks.includes(index) ? '' : word)))
    setStep('verify')
  }, [mnemonic, setInputsWords])

  // Compared against the phrase rather than against the three blanked words on their own, so a
  // wrong word anywhere fails, not just a wrong word in a slot we happened to blank.
  const verified = inputsWords.join(' ') === mnemonic

  const finish = useCallback(() => {
    if (created) {
      // The phrase stops here. Everything past creation works from the wallet record, and passing
      // it on would put a second copy of the wallet into application state.
      onCreated(created)
    }
  }, [created, onCreated])

  if (step === 'reveal') {
    return (
      <div>
        <h2>{t('slh-dsa.create.phrase-title')}</h2>
        <p data-testid="phrase-warning">{t('slh-dsa.create.phrase-warning')}</p>
        <div data-testid="recovery-phrase">
          <MnemonicInput
            disabled
            words={mnemonic}
            wordCount={wordCount}
            inputsWords={[]}
            onChangeInputWord={() => {}}
          />
        </div>
        <button type="button" data-testid="phrase-continue" onClick={startVerifying}>
          {t('slh-dsa.create.phrase-continue')}
        </button>
      </div>
    )
  }

  if (step === 'verify') {
    return (
      <div>
        <h2>{t('slh-dsa.create.verify-title')}</h2>
        <div data-testid="verify-phrase">
          <MnemonicInput
            words={mnemonic}
            wordCount={wordCount}
            inputsWords={inputsWords}
            blankIndexes={blankIndexes}
            onChangeInputWord={onChangeInput}
          />
        </div>
        <button type="button" data-testid="verify-continue" disabled={!verified} onClick={finish}>
          {t('slh-dsa.create.verify-continue')}
        </button>
      </div>
    )
  }

  return (
    <div>
      <h2>{t('slh-dsa.create.title')}</h2>

      <label htmlFor="pq-name">{t('slh-dsa.create.name')}</label>
      <input id="pq-name" data-testid="name" value={name} onChange={e => setName(e.target.value)} />

      <label htmlFor="pq-password">{t('slh-dsa.create.password')}</label>
      <input
        id="pq-password"
        data-testid="password"
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
      />

      <label htmlFor="pq-confirm">{t('slh-dsa.create.confirm')}</label>
      <input
        id="pq-confirm"
        data-testid="confirm"
        type="password"
        value={confirm}
        onChange={e => setConfirm(e.target.value)}
      />

      <p data-testid="parameter-set">{selected}</p>
      {current ? <p data-testid="witness-cost">{formatWitnessCost(current.witnessSize)}</p> : null}

      <p data-testid="signing-time-note">{t('slh-dsa.create.signing-takes-seconds')}</p>
      {description?.warnSlow ? (
        <p data-testid="slow-signing-warning">{t('slh-dsa.create.slow-signing-warning')}</p>
      ) : null}

      <button type="button" data-testid="toggle-advanced" onClick={() => setShowAdvanced(v => !v)}>
        {t('slh-dsa.create.advanced')}
      </button>

      {showAdvanced && grouped ? (
        <ul data-testid="advanced-parameter-sets">
          {[grouped.recommended, ...grouped.advanced].map(set => (
            <li key={set.name}>
              <button type="button" data-testid={`select-${set.name}`} onClick={() => setSelected(set.name)}>
                {set.name} — {formatWitnessCost(set.witnessSize)}
                {set.slowSigning ? ` — ${t('slh-dsa.create.slow')}` : ''}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p data-testid="create-error">{error}</p> : null}

      <button type="button" data-testid="submit" disabled={!canSubmit} onClick={submit}>
        {t('slh-dsa.create.submit')}
      </button>
    </div>
  )
}

CreateSlhDsaWallet.displayName = 'CreateSlhDsaWallet'

export default CreateSlhDsaWallet
