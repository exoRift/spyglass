import { useEffect, useRef, useState } from 'react'
import { Modal, Button } from 'react-daisyui'

import type { Config } from '../../lib/config'

import { MdWarning } from 'react-icons/md'

/**
 * A guard to display if the config failed to load
 */
function ConfigLoadFailureGuard (): React.ReactNode {
  const [open, setOpen] = useState(Boolean(window._invalidConfigSchemaError))

  return (
    <Modal.Legacy open={open}>
      <Modal.Header className='font-bold'>Failed to Load Config</Modal.Header>

      <Modal.Body>
        <p>A config file was detected but failed to load.</p>
        <br />
        <p>You can close the application to prevent data loss or continue anyway</p>

        <code className='block bg-base-300 w-full text-xs mt-2 p-2'>
          {window._invalidConfigSchemaError}
        </code>
      </Modal.Body>

      <Modal.Actions>
        <Button onClick={() => window.closeApplication()}>Close Spyglass</Button>
        <Button color='warning' onClick={() => setOpen(false)}>
          <MdWarning className='text-xl' />
          <span>Continue Anyway</span>
        </Button>
      </Modal.Actions>
    </Modal.Legacy>
  )
}

/**
 * A guard to display if the config failed to save
 */
function ConfigSaveFailureGuard (): React.ReactNode {
  const backup = useRef<Config>(null)
  const [error, setError] = useState<string | null>(null)
  const { Dialog, handleShow } = Modal.useDialog()

  useEffect(() => {
    window.saveConfigWithGuard = (cfg) => {
      return window.saveConfig(cfg)
        .catch((err) => {
          backup.current = cfg
          setError(err)
          handleShow()
          throw err
        })
    }
  }, [handleShow])

  return (
    <Dialog open={Boolean(error)}>
      <Modal.Header className='font-bold'>Failed to Save Config</Modal.Header>

      <Modal.Body>
        <p>Your config wasn't saved properly.</p>

        <code className='block bg-base-300 w-full text-xs mt-2 p-2'>
          {error}
        </code>

        <p>
          To prevent data loss, click <button className='link active:text-primary' onClick={() => navigator.clipboard.writeText(JSON.stringify(backup.current, null, 2))}>here</button> to copy the
          would-be config contents manually insert into your config file at <code className='bg-base-300 font-mono'>{window._configLocation}</code>.
          After inserting, restart Spyglass.
        </p>
      </Modal.Body>

      <Modal.Actions>
        <form method='dialog' className='contents'>
          <Button color='warning' onClick={() => { backup.current = null }}>
            <MdWarning className='text-xl' />
            <span>Continue to Spyglass</span>
          </Button>
        </form>
      </Modal.Actions>
    </Dialog>
  )
}

/**
 * A collection of modals relating to drivers and installation
 */
function DriverModals (): React.ReactNode {
  const { Dialog: DriverDialog } = Modal.useDialog()
  const { Dialog: ForgeDialog } = Modal.useDialog()
  const { Dialog: InstallationDialog, handleShow: showInstallationDialog } = Modal.useDialog()

  const [installationState, setInstallationState] = useState<[string, string | null] | null>(null)

  useEffect(() => {
    if (installationState) {
      showInstallationDialog()
      if (!installationState[1]) window.dispatchEvent(new Event('moduleinstalled'))
    }
  }, [installationState, showInstallationDialog])

  return (
    <>
      <DriverDialog id='driver-modal'>
        <Modal.Header className='text-lg font-bold'>Missing Driver</Modal.Header>
        <Modal.Body>
          <p>
            You are missing the <strong id='driver-name' /> driver to connect to this <strong id='client-name' /> database.
          </p>
          <p className='pt-2'>
            Do you want to install it from NPM?
          </p>
        </Modal.Body>

        <Modal.Actions>
          <form method='dialog' className='contents'>
            <Button>No</Button>
            <Button color='success' onClick={() => window.installDriver(window._missingDriver!).catch(() => null).then((res) => setInstallationState([window._missingDriver!, res]))}>Install</Button>
          </form>
        </Modal.Actions>
      </DriverDialog>

      <ForgeDialog id='forge-modal'>
        <Modal.Header className='text-lg font-bold'>Missing Driver</Modal.Header>
        <Modal.Body>
          <p>
            You are missing <a className='link' href='https://www.npmjs.com/package/data-forge' target='_blank' rel='noreferrer' onClick={(e) => { e.preventDefault(); void window.openLink(e.currentTarget.href) }}>data-forge</a>,
            an <strong>optional</strong> dependency for the custom map function that enables powerful data manipulation similar to Pandas
          </p>
          <p className='pt-2'>
            Do you want to install it from NPM?
          </p>
        </Modal.Body>

        <Modal.Actions>
          <form method='dialog' className='contents'>
            <Button>No</Button>
            <Button color='success' onClick={() => window.installDriver('data-forge').catch(() => null).then((res) => setInstallationState(['data-forge', res]))}>Install</Button>
          </form>
        </Modal.Actions>
      </ForgeDialog>

      <InstallationDialog>
        <Modal.Header className={installationState?.[1] ? 'text-error' : 'text-success'}>{installationState?.[1] ? 'Error!' : 'Success!'}</Modal.Header>

        <Modal.Body>
          {installationState?.[1]
            ? (
              <p>
                Failed to install <strong>{installationState[0]}</strong>

                <code className='block w-full p-2 text-sm font-mono'>{installationState[1]}</code>
              </p>
            )
            : (
              <p>
                <strong>{installationState?.[0]}</strong> was successfully installed!
              </p>
            )}
        </Modal.Body>

        <Modal.Actions>
          <form method='dialog' className='contents'>
            {installationState?.[1]
              ? <Button>OK</Button>
              : <Button color='primary'>Cool!</Button>}
          </form>
        </Modal.Actions>
      </InstallationDialog>
    </>
  )
}

/**
 * A group of components to mount parallel to the root (usually modals)
 */
export function Sidecar (): React.ReactNode {
  const { Dialog: CustomPasteDialog } = Modal.useDialog()

  return (
    <>
      <DriverModals />

      <CustomPasteDialog id='custompaste-modal'>
        <Modal.Header className='flex gap-2 items-center text-lg font-bold'>
          <MdWarning className='text-warning' />
          Security Warning
        </Modal.Header>
        <Modal.Body>
          <p>
            Be careful pasting code from untrusted sources.
            The custom map function is not <i>fully</i> sandboxed and is susceptible to attacks
          </p>
        </Modal.Body>

        <Modal.Actions>
          <form method='dialog' className='contents'>
            <Button onClick={() => { window._config.dismissedWarnings.push('custompaste') }}>Got it</Button>
          </form>
        </Modal.Actions>
      </CustomPasteDialog>

      <ConfigLoadFailureGuard />
      <ConfigSaveFailureGuard />
    </>
  )
}
