import { useCallback, useState } from 'react'

import type { renderRoute } from '../index'
import { twMerge } from 'tailwind-merge'
import { useObject } from 'react-exo-hooks'

import { Badge, Button, Form, Input, Modal, Select, Table, Toggle, Tooltip } from 'react-daisyui'

import logo from '../../assets/logo.png'
import { MdAdd, MdBuild, MdInfo } from 'react-icons/md'
import type { Config } from '../../lib/config'
import pkg from '../../../package.json' with { type: 'json' }

function envToBadge (env: Config['connections'][number]['environment']): React.ReactElement {
  switch (env) {
    case 'local': return <Badge variant='outline' color='neutral' className='uppercase'>{env}</Badge>
    case 'testing': return <Badge color='success' className='uppercase'>{env}</Badge>
    case 'development': return <Badge color='warning' className='uppercase'>{env}</Badge>
    case 'staging': return <Badge variant='outline' color='info' className='uppercase'>{env}</Badge>
    case 'production': return <Badge color='error' className='uppercase'>{env}</Badge>
  }
}

function ConnectionCreateButton ({ config }: { config: Config }): React.ReactNode {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showTestResults, setShowTestResults] = useState(false)
  const [testResult, setTestResult] = useState<number | null>(null)

  const onSubmit = useCallback((e: React.SubmitEvent<HTMLFormElement>) => {
    const form = e.currentTarget
    e.preventDefault()
    const mode = e.nativeEvent.submitter!.id
    const data = new FormData(form)

    const obj = Object.fromEntries(data.entries()) as any
    if (!obj.savepass) delete obj.password
    obj.charts = []

    const nameInput = document.getElementById('name') as HTMLInputElement
    if (config.connections.some((c) => c.name === obj.name)) {
      nameInput.setCustomValidity('Name already taken by another connection')
      nameInput.reportValidity()

      return
    }

    switch (mode) {
      case 'test':
        void testConnection(obj.client, obj)
          .then(setTestResult)
          .finally(() => setShowTestResults(true))

        break
      case 'submit':
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
          <Form id='create_form' className='space-y-4' onSubmit={onSubmit}>
            <div className='flex gap-4 *:grow'>
              <div className='fieldset w-full'>
                <label htmlFor='name' className='label'>
                  <span className='label-text'>Connection Name</span>
                </label>
                <Input className='w-full' id='name' name='name' required onChange={(e) => e.currentTarget.setCustomValidity('')} />
                <label htmlFor='name' className='label'>
                  <span className='label-text'>This is unrelated to the connection URL</span>
                </label>
              </div>

              <div className='fieldset w-max'>
                <label htmlFor='environment' className='label'>
                  <span className='label-text'>Environment</span>
                </label>
                <Select className='w-full' id='environment' name='environment' required>
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

            <div className='flex gap-4 *:grow'>
              <div className='fieldset w-1/3'>
                <label htmlFor='username' className='label'>
                  <span className='label-text'>Username</span>
                </label>
                <Input id='username' name='username' required />
              </div>

              <div className='fieldset w-2/3'>
                <label htmlFor='password' className='label'>
                  <span className='label-text'>Password</span>
                </label>
                <Input id='password' name='password' type='password' placeholder='Optional...' />
              </div>
            </div>

            <div className='flex gap-4 *:grow'>
              <div className='fieldset w-full'>
                <label htmlFor='host' className='label'>
                  <span className='label-text'>Host</span>
                </label>
                <Input className='w-full' id='host' name='host' required />
              </div>

              <div className='fieldset w-1/2'>
                <label htmlFor='port' className='label'>
                  <span className='label-text'>Port</span>
                </label>
                <Input className='w-full' id='port' name='port' pattern='\d+' placeholder='Optional...' />
              </div>

              <div className='fieldset w-full'>
                <label htmlFor='database' className='label'>
                  <span className='label-text'>Database</span>
                </label>
                <Input className='w-full' id='database' name='database' required />
              </div>
            </div>

            <div className='flex gap-4 justify-between'>
              <div className='fieldset w-max'>
                <label htmlFor='client' className='label'>
                  <span className='label-text'>SQL Client</span>
                </label>
                <Select className='w-full' id='client' name='client' required>
                  <Select.Option value='pg'>pg</Select.Option>
                  <Select.Option value='sqlite3'>sqlite3</Select.Option>
                  <Select.Option value='mysql'>mysql (MariaDB-compatible)</Select.Option>
                  <Select.Option value='oracledb'>oracledb</Select.Option>
                  <Select.Option value='tedious'>tedious (MSSQL)</Select.Option>
                </Select>
              </div>

              <div className='flex flex-col'>
                <label htmlFor='savepass' className='opacity-0'>Save Password</label>
                <div className='grow flex items-center'>
                  <Form.Label title='Save Password' className='text-sm'>
                    <Tooltip message='If not saved, password will be prompted on connect' position='left'>
                      <MdInfo className='cursor-help' />
                    </Tooltip>
                    <Toggle defaultChecked id='savepass' name='savepass' color='secondary' />
                  </Form.Label>
                </div>
              </div>
            </div>
          </Form>
        </Modal.Body>

        <Modal.Actions>
          <Button id='test' className='mr-auto' color='neutral' type='submit' form='create_form'>
            <MdBuild className='text-xl' />
            Test Connection
          </Button>

          <Button variant='outline' onClick={() => setShowCreateModal(false)} type='button'>Cancel</Button>
          <Button id='submit' color='success' type='submit' form='create_form'>Save</Button>
        </Modal.Actions>
      </Modal.Legacy>

      <Modal.Legacy open={showTestResults}>
        <Modal.Header>
          <h1 className={twMerge('font-bold', testResult === null ? 'text-error' : 'text-success')}>{testResult === null ? 'Connection failed' : 'Connection succeeded'}</h1>
        </Modal.Header>

        <Modal.Body>
          {testResult === null
            ? <p className='text-error/80 italic'>Failed to establish connection</p>
            : <p className='italic'>{`Connection established in ${Math.round(testResult * 100) / 100}ms`}</p>}
        </Modal.Body>

        <Modal.Actions>
          <Button type='button' color='neutral' onClick={() => setShowTestResults(false)}>Ok</Button>
        </Modal.Actions>
      </Modal.Legacy>
    </>
  )
}

export default function Connections ({ navigate }: { navigate: typeof renderRoute }): React.ReactNode {
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

      <div className='p-8 space-y-4'>
        <h2 className='text-neutral font-semibold text-xl'>Connections</h2>

        <Table>
          <Table.Head>
            <span>Env</span>
            <span>Name</span>
            <span>User</span>
            <span>Database</span>
            <span>DB Client</span>
            <span className='[:has(>&)]:w-0 [:has(>&)]:p-0' />
          </Table.Head>
          <Table.Body>
            {config.connections.map((c, i) => (
              <Table.Row key={c.name} className='transition not-[:has(&_button:hover)]:hover:bg-neutral/10 cursor-pointer border-b border-neutral/30' onClick={() => navigate('Dashboard', { connection: i })}>
                {envToBadge(c.environment)}
                <span>{c.name}</span>
                <span>{c.details.username}</span>
                <span>{c.details.database}</span>
                <code>{c.client}</code>
                <Button color='error' className='[:has(>&)]:w-0 [:has(>&)]:text-end' onClick={(e) => { e.stopPropagation(); config.connections.splice(i, 1) }}>Delete</Button>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>

        <ConnectionCreateButton config={config} />
      </div>
    </>
  )
}
