declare global {
  var SHIM_PORT: string // eslint-disable-line no-var
}

const PORT = parseInt(window.SHIM_PORT)

/**
 * When in development, it's easier to debug in a browser than a webview.\
 * Initialize a shim that replaces the webview binds with API calls
 */
export async function init (): Promise<void> {
  return void await Promise.all([
    fetch(`http://localhost:${PORT}/_binds`)
      .then((res) => res.json())
      .then((binds: string[]) => {
        for (const bind of binds) {
          (window as any)[bind] = function (...args: any[]): Promise<any> {
            return fetch(`http://localhost:${PORT}/${bind}`, {
              method: 'POST',
              body: JSON.stringify(args)
            })
              .then((res) => res.json())
          }
        }
      }),
    fetch(`http://localhost:${PORT}/getConfig`)
      .then((res) => res.json())
      .then((cfg) => { window._config = cfg }),
    fetch(`http://localhost:${PORT}/getConfigLocation`)
      .then((res) => res.json())
      .then((loc) => { window._configLocation = loc })
  ])
}
