import { useEffect, useState } from 'react'
import { Modal, Button } from 'react-daisyui'

export function Sidecar (): React.ReactNode {
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
          <form method='dialog'>
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
          <form method='dialog'>
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
          <form method='dialog'>
            <Button color='primary'>Cool!</Button>
          </form>
        </Modal.Actions>
      </InstallationDialog>
    </>
  )
}
