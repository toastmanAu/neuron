import React, { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoBack } from 'utils/hooks'
import { RoutePath } from 'utils'
import CreateSlhDsaWallet from './index'

/**
 * Route-ready wrapper.
 *
 * The form itself takes callbacks and knows nothing about routing, which keeps it testable without
 * a router. This supplies the two things a route needs: where to go afterwards, and where back is.
 */
const CreateSlhDsaWalletPage = () => {
  const navigate = useNavigate()
  const goBack = useGoBack()
  const onCreated = useCallback(() => navigate(RoutePath.Overview), [navigate])

  return <CreateSlhDsaWallet onCreated={onCreated} onBack={goBack} />
}

CreateSlhDsaWalletPage.displayName = 'CreateSlhDsaWalletPage'

export default CreateSlhDsaWalletPage
