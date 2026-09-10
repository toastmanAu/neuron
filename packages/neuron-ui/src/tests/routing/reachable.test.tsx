import React from 'react'
import { describe, it, expect } from 'vitest'
import type { RouteObject } from 'react-router-dom'
import mainRouterConfig from '../../router'
import { RoutePath } from '../../utils/enums'
import CreateSlhDsaWalletPage from '../../components/CreateSlhDsaWallet/page'
import ImportSlhDsaWalletPage from '../../components/ImportSlhDsaWallet/page'

/**
 * A component with tests but no route is invisible to users, and its tests still pass: they render
 * it directly and never need the app to mount it. That is exactly how the quantum-resistant wallet
 * screens shipped unreachable. These assertions are about being *mounted*, not about behaving.
 */
const flatten = (routes: RouteObject[]): RouteObject[] =>
  routes.flatMap(route => [route, ...flatten((route.children ?? []) as RouteObject[])])

const mountsComponent = (node: React.ReactNode, type: React.ElementType): boolean => {
  if (!React.isValidElement(node)) return false
  if (node.type === type) return true
  const { children } = node.props as { children?: React.ReactNode }
  return React.Children.toArray(children).some(child => mountsComponent(child, type))
}

describe('every feature screen is reachable from the router', () => {
  const routes = flatten(mainRouterConfig)

  it('routes to the quantum-resistant wallet creation screen', () => {
    const route = routes.find(r => r.path === RoutePath.CreateSlhDsaWallet)

    expect(route).toBeDefined()
    expect(mountsComponent(route!.element, CreateSlhDsaWalletPage)).toBe(true)
  })

  it('routes to the quantum-resistant wallet import screen', () => {
    const route = routes.find(r => r.path === RoutePath.ImportSlhDsaWallet)

    expect(route).toBeDefined()
    expect(mountsComponent(route!.element, ImportSlhDsaWalletPage)).toBe(true)
  })
})
