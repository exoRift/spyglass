import type { Config } from './config'

const media = window.matchMedia('(prefers-color-scheme: dark)')
/**
 * On preferred schema change, update the theme
 * @param e The event
 */
function onChange (e: MediaQueryListEvent): void {
  setTheme(e.matches ? 'dark' : 'light', true)
}

/**
 * Set the actively displayed theme
 * @param theme        The theme value to set
 * @param fromListener Is this being called from the listener? If so, don't affect the event listener registration
 */
export function setTheme (theme: Config['theme'], fromListener?: boolean): void {
  if (theme === 'system') {
    theme = media.matches ? 'dark' : 'light'
    if (!fromListener) media.addEventListener('change', onChange, { passive: true })
  } else if (!fromListener) media.removeEventListener('change', onChange)

  switch (theme) {
    case 'light': document.documentElement.setAttribute('data-theme', 'pearlwinter'); break
    case 'dark': document.documentElement.setAttribute('data-theme', 'pearlnight'); break
  }
}
