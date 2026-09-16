import React from 'react'
import { SuccessInfo, Error as ErrorIcon, Attention } from 'widgets/Icons/icon'
import styles from './index.module.scss'

type AlertStatus = 'init' | 'success' | 'error' | 'warn'

// Extra props are forwarded, the way Button and TextField already forward theirs, so callers can
// label an alert without wrapping it in an element that exists only to carry the attribute.
const Alert: React.FC<
  React.PropsWithChildren<
    { status: AlertStatus; className?: string; withIcon?: boolean } & React.LiHTMLAttributes<HTMLLIElement>
  >
> = ({ status, children, className, withIcon = true, ...rest }) => {
  return (
    <li className={`${styles[status]} ${className || ''} ${styles.alert}`} {...rest}>
      {withIcon && status === 'success' ? <SuccessInfo type="success" /> : null}
      {withIcon && status === 'error' ? <ErrorIcon type="error" /> : null}
      {withIcon && status === 'warn' && <Attention />}
      {children}
    </li>
  )
}

Alert.displayName = 'Alert'

export default Alert
