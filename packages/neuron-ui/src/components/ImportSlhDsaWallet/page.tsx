import React, { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoBack } from 'utils/hooks'
import { RoutePath } from 'utils'
import ImportSlhDsaWallet from './index'

/** Route-ready wrapper: supplies navigation, which the form itself deliberately knows nothing about. */
const ImportSlhDsaWalletPage = () => {
  const navigate = useNavigate()
  const goBack = useGoBack()
  const onImported = useCallback(() => navigate(RoutePath.Overview), [navigate])

  return <ImportSlhDsaWallet onImported={onImported} onBack={goBack} />
}

ImportSlhDsaWalletPage.displayName = 'ImportSlhDsaWalletPage'

export default ImportSlhDsaWalletPage
