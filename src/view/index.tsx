import { createRoot } from 'react-dom/client'

import Connections from './pages/Connections'
import Dashboard from './pages/Dashboard'

import { Sidecar } from './components/Sidecar'

import './styles/index.css'

if (import.meta.env.DEV && !window._config) { // eslint-disable-line @typescript-eslint/no-unnecessary-condition
  await import('../lib/dev/webviewshim').then((shim) => shim.init())
}

const main = document.getElementById('root') as HTMLDivElement
const sidecar = document.getElementById('sidecar') as HTMLDivElement
const mainRoot = createRoot(main)
const sidecarRoot = createRoot(sidecar)

const VIEWS = {
  Connections,
  Dashboard
}

document.body.setAttribute('data-theme', window._config.theme)

/**
 * Render a route component to the root of the view
 * @param route The route component
 * @param props Props to pass to the component
 */
export function renderRoute<R extends keyof typeof VIEWS> (route: R, props: Omit<React.ComponentProps<(typeof VIEWS)[R]>, 'navigate'>): void {
  const View = VIEWS[route] as React.FunctionComponent<any>

  mainRoot.render(<View navigate={renderRoute} {...props} />)
}

renderRoute('Connections', {})
sidecarRoot.render(<Sidecar />)
