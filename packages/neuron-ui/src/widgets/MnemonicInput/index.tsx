import React, { useMemo, useCallback, useState, useRef } from 'react'
import mnemonicWordList from '@ckb-lumos/hd/lib/mnemonic/word_list'
import { useDidMount } from 'utils'
import styles from './index.module.scss'

/**
 * Words in a standard BIP39 phrase, and the default this widget renders.
 *
 * Quantum-resistant wallets pass 36, 54 or 72: FIPS 205 has no BIP32, so their backup is three
 * BIP39 phrases concatenated rather than one.
 */
export const MNEMONIC_SENTENCE_WORDS = 12

const MnemonicInput = ({
  disabled,
  words,
  wordCount = MNEMONIC_SENTENCE_WORDS,
  inputsWords,
  onChangeInputWord,
  blankIndexes,
}: {
  disabled?: boolean
  words: string
  /** How many slots to render. The grid must show every position even before any are filled in. */
  wordCount?: number
  inputsWords: string[]
  onChangeInputWord: (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | {
          target: {
            dataset: { idx: string }
            value: string
          }
        }
  ) => void

  blankIndexes?: number[]
}) => {
  const wordList = useMemo(
    () => Object.assign(new Array(wordCount).fill(''), words ? words.split(' ') : []),
    [words, wordCount]
  )
  const [focusIndex, setFocusIndex] = useState(-1)
  const mounted = useRef(true)
  const root = useRef<HTMLDivElement>(null)

  const onDropdownClick = useCallback((e: React.SyntheticEvent<HTMLButtonElement>) => {
    const {
      dataset: { idx = '', value },
    } = e.target as HTMLButtonElement
    onChangeInputWord({
      target: {
        dataset: { idx },
        value: value || '',
      },
    })
    setFocusIndex(-1)
  }, [])

  const onFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setFocusIndex(Number(e.target.dataset.idx))
    },
    [setFocusIndex]
  )

  const options = useMemo(
    () => mnemonicWordList.filter(item => item.indexOf(inputsWords[focusIndex]) === 0),
    [focusIndex, inputsWords]
  )

  const onDocumentClick = useCallback(
    (e: MouseEvent) => {
      if (mounted.current && e.target instanceof Node && !root.current?.contains?.(e.target) && focusIndex) {
        setFocusIndex(-1)
      }
    },
    [setFocusIndex, focusIndex]
  )

  useDidMount(() => {
    document.addEventListener('click', onDocumentClick, false)
    return () => document.removeEventListener('click', onDocumentClick, false)
  })

  const getInputValue = useCallback(
    (idx: number) => {
      if (blankIndexes) {
        return blankIndexes.includes(idx) ? inputsWords[idx] : '***'
      }
      if (focusIndex === idx) {
        return inputsWords[idx]
      }
      return inputsWords[idx] ? '***' : ''
    },
    [blankIndexes, focusIndex, inputsWords]
  )

  return (
    <div className={styles.root} ref={root}>
      {disabled
        ? wordList.map((v, idx) => (
            <div key={v || idx.toString()} className={styles.showItem}>
              {idx + 1}
              <span>{v}</span>
            </div>
          ))
        : wordList.map((v, idx) => (
            <div
              key={v || idx.toString()}
              className={`${styles.wordItem}
              ${inputsWords[idx] && v && v !== inputsWords[idx] ? styles.errorWords : ''}`}
            >
              {idx + 1}
              <input
                disabled={blankIndexes && !blankIndexes.includes(idx)}
                data-idx={idx}
                value={getInputValue(idx)}
                className={styles.input}
                onChange={onChangeInputWord}
                onFocus={onFocus}
              />
              {focusIndex === idx && options.length && inputsWords[idx] ? (
                <div className={styles.dropdown}>
                  {options.map(item => (
                    <button
                      type="button"
                      className={styles.dropdownItem}
                      data-idx={idx}
                      data-value={item}
                      onClick={onDropdownClick}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
    </div>
  )
}

MnemonicInput.displayName = 'MnemonicInput'

export default MnemonicInput
