import React, { useCallback, useState } from 'react'
import { useObject } from 'react-exo-hooks'

import { setTheme } from '../../lib/theme'

import { Button, Modal, Select } from 'react-daisyui'
import { HoldButton } from './HoldButton'

import pkg from '../../../package.json'
import { MdSettings, MdUpdate } from 'react-icons/md'

const RELEASE_API_URL = 'https://api.github.com/repos/exoRift/spyglass/releases/latest'

/**
 * Compare two semantic versions. Returns true if the incoming version is greater than the current
 * @param current  The current version
 * @param incoming The incoming version
 * @returns        true if incoming > current
 */
function compareVersions (current: string, incoming: string): boolean {
  const currentSplit = current.split('.')
  const incomingSplit = incoming.split('.')

  for (let i = 0; i < currentSplit.length; ++i) {
    if (Number(incomingSplit[i]) > Number(currentSplit[i])) return true
  }

  return false
}

/**
 * A button to check for Spyglass updates
 */
function UpdateButton (): React.ReactNode {
  const [error, setError] = useState<Error | null>(null)
  const [checking, setChecking] = useState(false)
  const [update, setUpdate] = useState<string | null>()

  const checkForUpdate = useCallback(() => {
    setChecking(true)
    fetch(RELEASE_API_URL)
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text())

        const data = await res.json()
        const version = data.tag_name.slice(1)

        setUpdate(compareVersions(pkg.version, version) ? version : null)
      })
      .catch(setError)
      .finally(() => setChecking(false))
  }, [])

  const openUpdate = useCallback(() => {
    if (update) void window.openLink(`${pkg.homepage}/releases/tag/v${update}`)
  }, [update])

  return (
    <>
      <Modal.Legacy open={Boolean(error)}>
        <Modal.Header>Failed to check for updated</Modal.Header>
        <Modal.Body>
          <code className='error'>{error?.message}</code>
        </Modal.Body>
        <Modal.Actions>
          <Button onClick={() => setError(null)}>Okay</Button>
        </Modal.Actions>
      </Modal.Legacy>

      {update
        ? (
          <Button key='button' color='primary' onClick={openUpdate}>
            {`Update Available! (${update})`}
          </Button>
        )
        : (
          <Button disabled={checking} loading={checking} key='button' onClick={update === null ? undefined : checkForUpdate}>
            {!checking && <MdUpdate className='text-xl' />}
            {update === null ? 'No updates available' : 'Check for Updates'}
          </Button>
        )}
    </>
  )
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

        <Modal.Body className='grow flex max-sm:flex-col gap-2'>
          <div className='flex flex-col sm:w-1/2'>
            <div className='fieldset'>
              <label className='label' htmlFor='theme'>
                <span className='label-text'>Theme</span>
              </label>
              <Select className='max-sm:w-auto' id='theme' name='theme' defaultValue={config.theme} onChange={(e) => { config.theme = e.currentTarget.value as typeof config.theme; setTheme(config.theme); void window.saveConfig(config) }}>
                <Select.Option value='system'>System</Select.Option>
                <Select.Option value='light'>Light</Select.Option>
                <Select.Option value='dark'>Dark</Select.Option>
              </Select>
            </div>

            <div className='mt-auto flex flex-col gap-2 sm:w-fit'>
              <div className='flex gap-2 *:grow'>
                <Button onClick={() => void window.openLink(window._configLocation)}>Open Config File</Button>
                <div data-tip='Delete temp files, config file, and (if Bun is not already installed) database drivers' className='tooltip'>
                  <HoldButton className='w-full' time={1000} fill='var(--color-error)' pressedFill='var(--color-success)' onHold={() => window.deleteData()}>
                    <span className='absolute invisible in-data-pressed:visible'>Deleted</span>
                    <span className='visible in-data-pressed:invisible'>Delete Data</span>
                  </HoldButton>
                </div>
              </div>

              <div className='flex *:grow'>
                <Button onClick={() => void window.openLogFolder()}>Open Log Folder</Button>
              </div>
            </div>
          </div>

          <div className='flex flex-col sm:w-1/2 justify-end items-end max-sm:mt-auto'>
            <div className='fieldset'>
              <span className='text-end'>{`Spyglass Version: ${pkg.version}`}</span>
              <UpdateButton />
            </div>
          </div>
        </Modal.Body>

        <Modal.Actions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </Modal.Actions>
      </Modal.Legacy>
    </>
  )
}
