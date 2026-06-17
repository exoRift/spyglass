import { Button, Modal, Select } from 'react-daisyui'
import type { Config } from '../../lib/config'
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
 * Configure Spyglass settings
 * @param props
 * @param props.config The Spyglass config
 */
export function Settings ({ config }: { config: Config }): React.ReactNode {
  const { Dialog, handleShow } = Modal.useDialog()

  return (
    <>
      <button onClick={handleShow} className='group cursor-pointer' title='Settings'>
        <MdSettings className='transition duration-1000 text-3xl group-hover:rotate-360 ease-out' />
      </button>

      <Dialog className='flex flex-col max-w-none w-[80vw] h-[80vh] z-50'>
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
          <form method='dialog' className='contents'>
            <Button key='actions'>Close</Button>
          </form>
        </Modal.Actions>
      </Dialog>
    </>
  )
}
