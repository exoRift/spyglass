import { createRoot } from 'react-dom/client'

import Connections from './pages/Connections'
import Dashboard from './pages/Dashboard'

import './styles/index.css'

if (import.meta.env.DEV && !window._config) { // eslint-disable-line @typescript-eslint/no-unnecessary-condition
  await import('../lib/dev/webviewshim').then((shim) => shim.init())
}

const container = document.getElementById('root') as HTMLDivElement
const root = createRoot(container)

const VIEWS = {
  Connections,
  Dashboard
}

document.body.setAttribute('data-theme', _config.theme)

export function renderRoute<R extends keyof typeof VIEWS> (route: R, props: Omit<React.ComponentProps<(typeof VIEWS)[R]>, 'navigate'>): void {
  const View = VIEWS[route] as React.FunctionComponent<any>

  root.render(<View navigate={renderRoute} {...props} />)
}

renderRoute('Connections', {})
