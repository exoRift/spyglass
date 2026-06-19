import { useState } from 'react'
import { useObject } from 'react-exo-hooks'

import type { Config } from '../../lib/config'

import { Button, Modal, Select } from 'react-daisyui'

import { MdSettings } from 'react-icons/md'

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

/**
 * A button & modal to configure Spyglass settings
 */
export function Settings (): React.ReactNode {
  const [config] = useObject(window._config)

  // Have to use a state here instead of Dialog hook due to rerender from configs
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)} className='group cursor-pointer' title='Settings'>
        <MdSettings className='transition duration-1000 text-3xl group-hover:rotate-360 ease-out' />
      </button>

      <Modal.Legacy open={open} className='flex flex-col max-w-none w-[80vw] h-[80vh] z-50'>
        <Modal.Header>Settings</Modal.Header>

        <Modal.Body className='grow'>
          <div className='fieldset'>
            <label className='label' htmlFor='theme'>
              <span className='label-text'>Theme</span>
            </label>
            <Select id='theme' name='theme' defaultValue={config.theme} onChange={(e) => { config.theme = e.currentTarget.value as typeof config.theme; setTheme(config.theme); void window.saveConfig(config) }}>
              <Select.Option value='system'>System</Select.Option>
              <Select.Option value='light'>Light</Select.Option>
              <Select.Option value='dark'>Dark</Select.Option>
            </Select>
          </div>
        </Modal.Body>

        <Modal.Actions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </Modal.Actions>
      </Modal.Legacy>
    </>
  )
}
