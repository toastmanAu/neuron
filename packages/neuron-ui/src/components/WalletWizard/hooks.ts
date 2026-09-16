import { useState, useCallback } from 'react'
import { MNEMONIC_SENTENCE_WORDS } from 'widgets/MnemonicInput'

/**
 * Backing state for a mnemonic grid.
 *
 * `wordCount` defaults to a standard BIP39 phrase. Quantum-resistant wallets pass 36, 54 or 72:
 * FIPS 205 has no BIP32, so their backup is three BIP39 phrases concatenated.
 */
export const useInputWords = (wordCount: number = MNEMONIC_SENTENCE_WORDS) => {
  const [inputsWords, setInputsWords] = useState<string[]>(new Array(wordCount).fill(''))
  const onChangeInput = useCallback(
    (
      e:
        | React.ChangeEvent<HTMLInputElement>
        | {
            target: {
              dataset: { idx: string }
              value: string
            }
          }
    ) => {
      const idx = Number(e.target.dataset.idx)
      if (Number.isNaN(idx)) return
      const { value } = e.target
      if (Number(idx) === 0) {
        const list = value
          .trim()
          .replace(/[^0-9a-z]+/g, ' ')
          .split(' ')
        if (list.length === wordCount) {
          setInputsWords(list)
          return
        }
      }

      setInputsWords(v => {
        const newWords = [...v]
        newWords[idx] = value
        return newWords
      })
    },
    [setInputsWords, wordCount]
  )
  return {
    inputsWords,
    onChangeInput,
    setInputsWords,
  }
}

export default {
  useInputWords,
}
