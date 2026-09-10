import React, { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGoBack } from 'utils/hooks'
import { RoutePath } from 'utils'
import ImportSlhDsaWallet from './index'

/** Route-ready wrapper: supplies navigation, which the form itself deliberately knows nothing about. */
const ImportSlhDsaWalletPage = () => {
  const [t] = useTranslation()
  const navigate = useNavigate()
  const goBack = useGoBack()
  const onImported = useCallback(() => navigate(RoutePath.Overview), [navigate])

  return (
    <div>
      <button type="button" onClick={goBack}>
        {t('common.back')}
      </button>
      <ImportSlhDsaWallet onImported={onImported} />
    </div>
  )
}

ImportSlhDsaWalletPage.displayName = 'ImportSlhDsaWalletPage'

export default ImportSlhDsaWalletPage
