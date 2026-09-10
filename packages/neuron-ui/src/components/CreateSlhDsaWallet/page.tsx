import React, { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGoBack } from 'utils/hooks'
import { RoutePath } from 'utils'
import CreateSlhDsaWallet from './index'

/**
 * Route-ready wrapper.
 *
 * The form itself takes an `onCreated` callback and knows nothing about routing, which keeps it
 * testable without a router. This supplies the one thing a route needs: where to go afterwards.
 */
const CreateSlhDsaWalletPage = () => {
  const [t] = useTranslation()
  const navigate = useNavigate()
  const goBack = useGoBack()
  const onCreated = useCallback(() => navigate(RoutePath.Overview), [navigate])

  return (
    <div>
      <button type="button" onClick={goBack}>
        {t('common.back')}
      </button>
      <CreateSlhDsaWallet onCreated={onCreated} />
    </div>
  )
}

CreateSlhDsaWalletPage.displayName = 'CreateSlhDsaWalletPage'

export default CreateSlhDsaWalletPage
