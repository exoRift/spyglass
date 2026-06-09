import React, { useCallback, useState } from 'react'
import { twMerge } from 'tailwind-merge'

import { createPortal } from 'react-dom'
import { useObject } from 'react-exo-hooks'
import type { renderRoute } from '../index'

import { Badge, Button, Form, Input, Modal, Select, Table, Toggle, Tooltip } from 'react-daisyui'

import type { Config, Connection } from '../../lib/config'

import logo from '../../assets/logo.png'
import { MdAdd, MdBuild, MdInfo, MdEdit, MdDelete, MdFileCopy, MdWarning } from 'react-icons/md'
import pkg from '../../../package.json' with { type: 'json' }
import { PasswordInput } from '../components/PasswordInput'
import { NativeFileInput } from '../components/NativeFileInput'

const DB_CLIENT_DISPLAYNAME_MAP: Record<Connection['details']['client'], string> = {
  postgres: 'Postgres',
  cockroachdb: 'CockroachDB',
  redshift: 'Redshift',
  mariadb: 'MariaDB',
  mysql: 'MySQL',
  oracledb: 'Oracle',
  sqlite: 'SQLite',
  mssql: 'MSSQL'
}

function getCopyName (config: Config, name: string): string {
  let copyName = `Copy of ${name}`

  while (config.connections.some((c) => c.name === copyName)) {
    const match = copyName.match(/ \((\d+?)\)$/)
    const number = match?.[1] ?? '0'

    copyName = copyName.slice(0, match?.index) + ` (${parseInt(number) + 1})`
  }

  return copyName
}

function envToBadge (env: Config['connections'][number]['environment']): React.ReactElement {
  switch (env) {
    case 'local': return <Badge variant='outline' color='neutral' className='uppercase'>{env}</Badge>
    case 'testing': return <Badge color='success' className='uppercase'>{env}</Badge>
    case 'development': return <Badge color='warning' className='uppercase'>{env}</Badge>
    case 'staging': return <Badge variant='outline' color='info' className='uppercase'>{env}</Badge>
    case 'production': return <Badge color='error' className='uppercase'>{env}</Badge>
  }
}

function ConnectionTestResultModal ({ testResult, onClose, ...props }: React.ComponentProps<typeof Modal.Legacy> & { testResult: null | number | string, onClose: () => void }): React.ReactNode {
  return (
    <Modal.Legacy {...props}>
      <Modal.Header>
        <h1 className={twMerge('font-bold', typeof testResult === 'number' ? 'text-success' : 'text-error')}>{typeof testResult === 'number' ? 'Connection succeeded' : 'Connection failed'}</h1>
      </Modal.Header>

      <Modal.Body>
        {testResult === null
          ? <p className='text-error/80 italic'>Failed to establish connection</p>
          : typeof testResult === 'string'
            ? <p className='text-error/80 italic'>Failed to establish connection ({testResult})</p>
            : <p className='italic'>{`Connection established in ${Math.round(testResult * 100) / 100}ms`}</p>}
      </Modal.Body>

      <Modal.Actions>
        <Button type='button' color='neutral' onClick={onClose}>OK</Button>
      </Modal.Actions>
    </Modal.Legacy>
  )
}

type MergeUnion<T> = {
  [K in T extends any ? keyof T : never]?:
  T extends any
    ? K extends keyof T
      ? T[K]
      : never
    : never;
}

function ConnectionForm ({ className, defaultValues, ...props }: React.ComponentProps<typeof Form> & { defaultValues?: Omit<Connection, 'details'> & { details: MergeUnion<Connection['details']> } }): React.ReactNode {
  const [client, setClient] = useState<Connection['details']['client']>(defaultValues?.details.client ?? 'postgres')

  const defaultSavePassword = typeof defaultValues === 'undefined'
    ? true
    : typeof defaultValues.details.password === 'string'

  return (
    <Form className={twMerge('space-y-4', className)} {...props}>
      <div className='flex gap-4 *:grow'>
        <div className='fieldset w-full'>
          <label htmlFor='name' className='label'>
            <span className='label-text'>Connection Name</span>
          </label>
          <Input className='w-full' id='name' name='name' defaultValue={defaultValues?.name} required onChange={(e) => e.currentTarget.setCustomValidity('')} />
          <label htmlFor='name' className='label'>
            <span className='label-text'>This is unrelated to the connection URL</span>
          </label>
        </div>

        <div className='fieldset w-max'>
          <label htmlFor='environment' className='label'>
            <span className='label-text'>Environment</span>
          </label>
          <Select className='w-full' id='environment' name='environment' defaultValue={defaultValues?.environment} required>
            <Select.Option value='local'>Local</Select.Option>
            <Select.Option value='testing'>Testing</Select.Option>
            <Select.Option value='development'>Development</Select.Option>
            <Select.Option value='staging'>Staging</Select.Option>
            <Select.Option value='production'>Production</Select.Option>
          </Select>
          <label htmlFor='environment' className='label'>
            <span className='label-text'>This is unrelated to the connection URL</span>
          </label>
        </div>
      </div>

      {client === 'sqlite'
        ? (
          <div className='fieldset'>
            <label htmlFor='filename' className='label'>
              <span className='label-text'>Database File</span>
            </label>
            <NativeFileInput defaultValue={defaultValues?.details.filename} id='filename' name='filename' accept='.sqlite, .sqlite3, .db, .db3, .s3db, .sl3' required />
          </div>
        )
        : (
          <>
            <div className='flex gap-4 *:grow'>
              <div className='fieldset w-1/3'>
                <label htmlFor='username' className='label'>
                  <span className='label-text'>Username</span>
                </label>
                <Input id='username' name='username' defaultValue={defaultValues?.details.username} required />
              </div>

              <div className='fieldset w-2/3'>
                <label htmlFor='password' className='label'>
                  <span className='label-text'>Password</span>
                </label>
                <PasswordInput id='password' name='password' placeholder='Optional...' defaultValue={defaultValues?.details.password} />
              </div>
            </div>

            <div className='flex gap-4 *:grow'>
              <div className='fieldset w-full'>
                <label htmlFor='host' className='label'>
                  <span className='label-text'>Host</span>
                </label>
                <Input className='w-full' id='host' name='host' defaultValue={defaultValues?.details.host} required />
              </div>

              <div className='fieldset w-1/2'>
                <label htmlFor='port' className='label'>
                  <span className='label-text'>Port</span>
                </label>
                <Input className='w-full' id='port' name='port' pattern='\d+' placeholder='Optional...' defaultValue={defaultValues?.details.port} />
              </div>

              <div className='fieldset w-full'>
                <label htmlFor='database' className='label'>
                  <span className='label-text'>Database</span>
                </label>
                <Input className='w-full' id='database' name='database' defaultValue={defaultValues?.details.database} required />
              </div>
            </div>
          </>
        )}

      <div className='flex gap-4 justify-between'>
        <div className='fieldset w-max'>
          <label htmlFor='client' className='label'>
            <span className='label-text'>SQL Client (driver)</span>
          </label>
          <Select className='w-full' id='client' name='client' value={client} onChange={(e) => setClient(e.currentTarget.value as Connection['details']['client'])} required>
            {Object.entries(DB_CLIENT_DISPLAYNAME_MAP).map(([driver, name]) => (
              <Select.Option value={driver} key={driver}>{name}</Select.Option>
            ))}
          </Select>
        </div>

        {client !== 'sqlite' && (
          <div className='flex flex-col'>
            <label htmlFor='savepass' className='opacity-0'>Save Password</label>
            <div className='grow flex items-center'>
              <Form.Label title='Save Password' className='text-sm'>
                <Tooltip message='If not saved, password will be prompted on connect' position='left'>
                  <MdInfo className='cursor-help' />
                </Tooltip>
                <Toggle defaultChecked={defaultSavePassword} id='savepass' name='savepass' color='secondary' />
              </Form.Label>
            </div>
          </div>
        )}
      </div>
    </Form>
  )
}

function ConnectionCreateButton ({ config }: { config: Config }): React.ReactNode {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showTestResultsModal, setShowTestResultsModal] = useState(false)
  const [testResult, setTestResult] = useState<number | null | string>(null)

  const onSubmit = useCallback((e: React.SubmitEvent<HTMLFormElement>) => {
    const form = e.currentTarget
    e.preventDefault()
    const mode = e.nativeEvent.submitter!.id
    const data = new FormData(form)

    const {
      savepass,
      ...obj
    } = Object.fromEntries(data.entries()) as any
    if (!savepass) delete obj.password
    obj.charts = []

    const nameInput = document.getElementById('name') as HTMLInputElement
    if (config.connections.some((c) => c.name === obj.name)) {
      nameInput.setCustomValidity('Name already taken by another connection')
      nameInput.reportValidity()

      return
    }

    switch (mode) {
      case 'test':
        void testConnection(obj)
          .then(setTestResult)
          .finally(() => setShowTestResultsModal(true))

        break
      case 'submit': {
        const {
          client,
          username,
          password,
          host,
          port,
          database,
          filename
        } = obj
        obj.details = {
          client,
          username,
          password,
          host,
          port,
          database,
          filename
        }
        config.connections.push(obj)

        void saveConfig(config)
          .then((errs) => {
            if (errs !== null) {
              void logError(errs)
              return
            }

            setShowCreateModal(false)
            form.reset()
          })

        break
      }
    }
  }, [config])

  return (
    <>
      <Button color='primary' onClick={() => setShowCreateModal(true)}>
        <MdAdd className='text-xl' />
        New Connection
      </Button>

      <Modal.Legacy open={showCreateModal}>
        <Modal.Header>
          <h1 className='font-bold'>Create New Connection</h1>
        </Modal.Header>

        <Modal.Body>
          <ConnectionForm id='create_connection_form' onSubmit={onSubmit} />
        </Modal.Body>

        <Modal.Actions>
          <Button id='test' className='mr-auto' color='neutral' type='submit' form='create_connection_form'>
            <MdBuild className='text-xl' />
            Test Connection
          </Button>

          <Button variant='outline' onClick={() => setShowCreateModal(false)} type='button'>Cancel</Button>
          <Button id='submit' color='success' type='submit' form='create_connection_form'>Save</Button>
        </Modal.Actions>
      </Modal.Legacy>

      <ConnectionTestResultModal testResult={testResult} open={showTestResultsModal} onClose={() => setShowTestResultsModal(false)} />
    </>
  )
}

function ConnectionEditButton ({ config, connIndex, startEditing }: { config: Config, connIndex: number, startEditing?: boolean }): React.ReactNode {
  const connection = config.connections[connIndex]!

  const [showEditModal, setShowEditModal] = useState(startEditing ?? false)
  const [showTestResultsModal, setShowTestResultsModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [testResult, setTestResult] = useState<number | null | string>(null)

  const onSubmit = useCallback((e: React.SubmitEvent<HTMLFormElement>) => {
    const form = e.currentTarget
    e.preventDefault()
    const mode = e.nativeEvent.submitter!.id
    const data = new FormData(form)

    const {
      savepass,
      ...obj
    } = Object.fromEntries(data.entries()) as any
    if (!savepass) delete obj.password

    const nameInput = document.getElementById('name') as HTMLInputElement
    if (config.connections.some((c) => c !== connection && c.name === obj.name)) {
      nameInput.setCustomValidity('Name already taken by another connection')
      nameInput.reportValidity()

      return
    }

    switch (mode) {
      case 'test':
        void testConnection(obj)
          .then(setTestResult)
          .finally(() => setShowTestResultsModal(true))

        break
      case 'submit': {
        const {
          client,
          username,
          password,
          host,
          port,
          database,
          filename
        } = obj
        obj.details = {
          client,
          username,
          password,
          host,
          port,
          database,
          filename
        }
        Object.assign(connection, obj)

        void saveConfig(config)
          .then((errs) => {
            if (errs !== null) {
              void logError(errs)
              return
            }

            setShowEditModal(false)
            form.reset()
          })

        break
      }
    }
  }, [config, connection])

  const formID = `edit_connection_form_${connIndex}`

  return (
    <>
      <Button color='secondary' onClick={(e) => { e.stopPropagation(); setShowEditModal(true) }} className='[:has(>&)]:w-0'>
        <MdEdit className='text-lg' />
        Edit
      </Button>

      {createPortal((
        <>
          <Modal.Legacy open={showEditModal}>
            <Modal.Header className='flex gap-2'>
              <h1 className='mr-auto'>
                <span>Edit Connection: </span>
                <strong>{connection.name}</strong>
              </h1>

              <Button size='sm' color='neutral' onClick={() => { config.connections.push({ ...connection, name: getCopyName(config, connection.name) }); setShowEditModal(false); void saveConfig(config) }}>
                <MdFileCopy className='text-base' />
                Duplicate
              </Button>

              <Button size='sm' color='error' onClick={() => setShowDeleteModal(true)}>
                <MdDelete className='text-base' />
                Delete
              </Button>
            </Modal.Header>

            <Modal.Body>
              <ConnectionForm key={+connection} id={formID} defaultValues={connection} onSubmit={onSubmit} />
            </Modal.Body>

            <Modal.Actions>
              <Button id='test' className='mr-auto' color='neutral' type='submit' form={formID}>
                <MdBuild className='text-lg' />
                Test Connection
              </Button>

              <Button variant='outline' onClick={() => setShowEditModal(false)} type='button'>Cancel</Button>
              <Button id='submit' color='success' type='submit' form={formID}>Save</Button>
            </Modal.Actions>
          </Modal.Legacy>

          <ConnectionTestResultModal testResult={testResult} open={showTestResultsModal} onClose={() => setShowTestResultsModal(false)} />

          <Modal.Legacy open={showDeleteModal}>
            <Modal.Header>
              <h1 className='font-bold'>Delete Connection</h1>
            </Modal.Header>

            <Modal.Body>
              <p>
                <span>Are you sure you want to delete </span>
                <strong>{connection.name}</strong>
                <span>?</span>
              </p>
            </Modal.Body>

            <Modal.Actions>
              <Button type='button' color='neutral' onClick={() => setShowDeleteModal(false)}>No</Button>
              <Button type='button' color='error' onClick={() => { config.connections.splice(connIndex, 1); void saveConfig(config) }}>Yes</Button>
            </Modal.Actions>
          </Modal.Legacy>
        </>
      ), document.body
      )}
    </>
  )
}

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
        <Button onClick={() => closeApplication()}>Close Spyglass</Button>
        <Button color='warning' onClick={() => setOpen(false)}>
          <MdWarning className='text-xl' />
          <span>Continue Anyway</span>
        </Button>
      </Modal.Actions>
    </Modal.Legacy>
  )
}

export default function Connections ({ navigate, editing }: { navigate: typeof renderRoute, editing?: number }): React.ReactNode {
  const [config] = useObject(_config)

  return (
    <>
      <header className='flex gap-4 items-center justify-between bg-base-300 transition-colors duration-300 py-2 px-4'>
        <div className='flex gap-4 items-center'>
          <img src={logo} alt='Spyglass' className='w-16 h-12 object-cover dark:invert dark:hue-rotate-180' />

          <h1 className='text-secondary text-xl font-bold -translate-x-8 translate-y-4 italic'>Spyglass</h1>
        </div>

        <div>
          <a href={pkg.homepage} target='_blank' rel='noreferrer' onClick={(e) => { e.preventDefault(); void openLink(e.currentTarget.href) }}>
            <img src='https://github.com/favicon.ico' alt='GitHub' className='size-6 dark:invert' />
          </a>
        </div>
      </header>

      <div className='p-8 space-y-4 overflow-auto h-0 grow'>
        <h2 className='text-neutral font-semibold text-xl'>Connections</h2>

        <Table>
          <Table.Head>
            <span className='[:has(>&)]:whitespace-nowrap [:has(>&)]:w-[1%]'>Environment</span>
            <span>Name</span>
            <span>User</span>
            <span>Database</span>
            <span>DB Client</span>
            <span className='[:has(>&)]:whitespace-nowrap [:has(>&)]:w-[1%] [:has(>&)]:p-0' />
          </Table.Head>
          <Table.Body>
            {config.connections.map((c, i) => (
              <Table.Row key={c.name} className='transition-colors duration-300 not-[:has(&_button:hover)]:hover:bg-neutral/10 cursor-pointer border-b border-neutral/30' onClick={() => navigate('Dashboard', { connIndex: i })}>
                <span className='[:has(>&)]:whitespace-nowrap [:has(>&)]:w-[1%]'>{envToBadge(c.environment)}</span>
                <span className='font-semibold'>{c.name}</span>
                <span>{c.details.client === 'sqlite' ? 'File' : c.details.username}</span>
                <span>{c.details.client === 'sqlite' ? c.details.filename : c.details.database}</span>
                <span>{DB_CLIENT_DISPLAYNAME_MAP[c.details.client]}</span>
                <ConnectionEditButton config={config} connIndex={i} startEditing={editing === i} />
              </Table.Row>
            ))}
          </Table.Body>
        </Table>

        <ConnectionCreateButton config={config} />

        <ConfigLoadFailureGuard />
      </div>
    </>
  )
}
