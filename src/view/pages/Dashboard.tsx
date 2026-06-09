import type { Column } from 'knex-schema-inspector/dist/types/column'

import { twMerge } from 'tailwind-merge'
import { getUnproxiedObject, useMap, useObject } from 'react-exo-hooks'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { renderRoute } from '../index'

import { type Layout, type WidgetProps, Dashboard as Dash } from 'dashup'
import { Alert, Button, Drawer, Form, Input, Modal, Tooltip } from 'react-daisyui'
import { Chart } from '../components/Chart'
import { ChartEditPane } from '../components/ChartEditPane'

import { MdArrowLeft, MdCable, MdDelete, MdFileCopy, MdSave, MdWarning } from 'react-icons/md'
import 'dashup/style.css'

export default function Dashboard ({ navigate, connIndex }: { navigate: typeof renderRoute, connIndex: number }): React.ReactNode {
  const [config, setConfig] = useObject(_config)
  const connection = config.connections[connIndex]!

  const {
    Dialog: UnsavedDialog,
    handleShow: promptUnsaved
  } = Modal.useDialog()

  const [dashKey, setDashKey] = useState(0)
  const [isUnsaved, setIsUnsaved] = useState<boolean | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [tables, setTables] = useState<Partial<Record<string, Column[]>> | null>({})
  const errors = useMap<number, Error | undefined>()
  const [connected, setConnected] = useState(false)

  const [password, setPassword] = useState<string>()
  const [passwordError, setPasswordError] = useState<string>()

  const charts = useMemo(() => {
    return connection.charts.map<WidgetProps>((c, i) => ({
      id: i.toString(),
      ...c.pos,
      component: (
        <Chart
          chart={c}
          tables={tables}
          canQuery={connected}
          onContextMenu={(e) => {
            e.preventDefault()
            setEditing(i)

            const lastEdited = document.querySelectorAll('[data-last-edited]')
            lastEdited.forEach((w) => w.toggleAttribute('data-last-edited', false))

            const widget = e.currentTarget.closest('.dashup-widget')!
            widget.toggleAttribute('data-editing', true)
            widget.toggleAttribute('data-last-edited', true)
          }}
          onError={(e) => errors.set(i, e)}
        />
      ),
      draggable: true,
      resizable: true,
      dragHandleClassName: 'handle',
      minWidth: 10,
      minHeight: 10,
      maxWidth: 100
    }))
  }, [errors, +errors, connection.charts, +connection.charts, connected, tables])

  const createWidget = useCallback((e: React.MouseEvent) => {
    const x = Math.min(Math.round(e.clientX / e.currentTarget.clientWidth * 100), 100 - 30)
    const y = Math.round(e.clientY / e.currentTarget.clientHeight * 50)

    connection.charts.push({
      pos: {
        x,
        y,
        width: 30,
        height: 30
      },
      title: 'untitled',
      subtitle: '',
      xTitle: 'Category',
      yTitle: 'Value',
      method: {
        type: 'value',
        x: null,
        y: null
      },
      style: 'line',
      table: null
    })

    setIsUnsaved(true)
  }, [connection])

  const updateWidgets = useCallback((widgets: Layout) => {
    for (let w = 0; w < widgets.length; ++w) {
      const widget = widgets[w]!
      if (!connection.charts[w]) continue

      const newPos = {
        x: widget.x,
        y: widget.y,
        width: widget.width,
        height: widget.height
      }

      Object.assign(connection.charts[w]!.pos, newPos)
      setIsUnsaved(true)
    }
  }, [connection])

  const save = useCallback(() => {
    void saveConfig(config)
      .then(() => setIsUnsaved(false))
  }, [config])

  const restoreConfig = useCallback(() => {
    void getConfig()
      .then((cfg) => {
        _config = cfg
        setConfig(_config)
      })
      .then(() => setIsUnsaved(null))
      .then(() => setDashKey((prior) => prior + 1))
  }, [setConfig])

  const connect = useCallback((e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const pw = (data.get('password') as string | null) ?? ''

    setPasswordError(undefined)
    void testConnection({
      ...connection.details,
      password: pw
    })
      .then((r) => {
        if (typeof r !== 'number') setPasswordError(`Could not connect. Is the password incorrect? (${r})`)
        else setPassword(pw)
      })
  }, [connection])

  useEffect(() => {
    if (connection.details.client === 'sqlite' || connection.details.password !== undefined || password !== undefined) {
      void setActiveConnection(connIndex, password)
        .then(getTables)
        .then(setTables)
        .then(() => setConnected(true))
    }
  }, [connection, connIndex, password])

  useEffect(() => setIsUnsaved((prior) => prior !== null), [connection, +connection])

  useEffect(() => {
    // Dashup widgets start at the wrong width for some reason. This will correct them
    setTimeout(() => window.dispatchEvent(new Event('resize')), 5)
  }, [])

  const editedChart = editing === null ? null : connection.charts[editing]!

  return (
    <div className='flex flex-col w-screen h-screen'>
      <Alert className={twMerge('transition fixed left-2 bottom-2 translate-y-4 opacity-0 z-50 pointer-events-none', tables === null && 'opacity-100 translate-y-0 pointer-events-auto')} icon={<MdWarning className='text-warning text-lg' />}>
        <div className='flex items-center gap-2'>
          <span>Spyglass cannot connect to the database.</span>
          <Button variant='link' size='sm' className='p-0' onClick={() => { void setActiveConnection(-1); navigate('Connections', { editing: connIndex }) }}>Edit Connection</Button>
        </div>
      </Alert>

      <header className='flex gap-4 items-center bg-base-300 transition-colors duration-300 p-2 px-4'>
        <Button
          variant='link'
          className='text-primary px-0'
          onClick={() => {
            if (isUnsaved) promptUnsaved()
            else {
              void setActiveConnection(-1)
              navigate('Connections', {})
            }
          }}
        >
          <MdArrowLeft className='text-xl' />
          Back
        </Button>

        <Button onClick={save} color='secondary' className={twMerge('transition opacity-0 ml-auto pointer-events-none', isUnsaved && 'animate-pulse opacity-100 pointer-events-auto z-40', editing !== null && 'translate-x-[-25rem]')}>
          <MdSave className='text-xl' />
          Save
        </Button>
      </header>

      <div className={twMerge('transition duration-700 h-0 grow overflow-auto dark:[&_.resizable-handle]:!invert [&_.dashup-widget]:bg-base-200 [&_[data-last-edited]]:!z-20 [&_.dashup-widget_.wrapper]:!overflow-visible [&_.dashup-widget]:!overflow-visible [&_.dashup-widget]:animate-[fade-in_0.5s_ease-out_forwards_normal] [&_.dashup-widget:hover]:!z-30 opacity-0', connected && 'opacity-100')} onDoubleClick={createWidget}>
        <div className={twMerge('transition [&>.dashup]:empty:before:content-["Double_click_to_add_a_chart"] [&>.dashup]:before:text-base-content/30 [&>.dashup]:before:text-3xl [&>.dashup]:empty:flex [&>.dashup]:empty:justify-center [&>.dashup]:empty:items-center [&>.dashup]:empty:!h-full [&:has(.dashup:empty)]:h-full', editing !== null && '-translate-x-48')}>
          <Dash key={dashKey} widgets={charts} packing columns={100} rowHeight={1} placeholderClassName='!transition-none' onChange={updateWidgets} />
          <div className={twMerge('transition fixed min-h-screen inset-0 bg-black opacity-0 z-10 pointer-events-none', editing !== null && 'opacity-30')} />
        </div>
      </div>

      <Drawer
        open={editing !== null}
        side={editedChart && (
          <div className='w-96 h-screen overflow-auto bg-base-200 p-6 space-y-4'>
            <div className='flex gap-4 items-center justify-between mb-4'>
              <div className='flex items-center gap-4'>
                <h1 className='text-2xl font-bold'>Edit Chart</h1>

                <Tooltip color='info' message='Duplicate' position='right'>
                  <button className='flex items-center text-info text-xl cursor-pointer' onClick={() => { connection.charts.splice(editing!, 0, structuredClone(getUnproxiedObject(connection.charts[editing!]!))); setEditing(null); setIsUnsaved(true) }}>
                    <MdFileCopy />
                  </button>
                </Tooltip>
              </div>

              <Tooltip color='error' message='Delete' position='left'>
                <button className='flex items-center text-error text-2xl cursor-pointer' onClick={() => { connection.charts.splice(editing!, 1); setEditing(null); setIsUnsaved(true) }}>
                  <MdDelete />
                </button>
              </Tooltip>
            </div>

            <ChartEditPane tables={tables} editedChart={editedChart} error={errors.get(editing!)} />
          </div>
        )}
        sideClassName='z-30'
        overlayClassName='!bg-transparent'
        onClickOverlay={() => {
          const widgets = document.querySelectorAll('[data-editing]')
          widgets.forEach((w) => w.toggleAttribute('data-editing', false))
          setEditing(null)
        }}
        end
      />

      <Modal open={connection.details.client !== 'sqlite' && connection.details.password === undefined && password === undefined}>
        <Modal.Header>
          <span>Enter a password to access </span>
          <strong>{connection.name}</strong>
        </Modal.Header>

        <Modal.Body>
          <Form id='password_form' onSubmit={connect}>
            <div className='fieldset'>
              <Input autoFocus placeholder='Enter Password...' name='password' id='password' type='password' className='w-full' />
              {passwordError && <label htmlFor='password' className='label text-error text-wrap'>{passwordError}</label>}
            </div>
          </Form>
        </Modal.Body>

        <Modal.Actions>
          <Button type='button' form='password_form' onClick={() => navigate('Connections', {})}>
            Cancel
          </Button>

          <Button color='primary' type='submit' form='password_form'>
            <MdCable className='text-xl' />
            Connect
          </Button>
        </Modal.Actions>
      </Modal>

      <UnsavedDialog backdrop>
        <Modal.Header>
          You have unsaved changes
        </Modal.Header>

        <Modal.Body>
          <p>You can't exit while you have unsaved changes</p>
        </Modal.Body>

        <Modal.Actions>
          <Button color='error' onClick={restoreConfig}>
            <MdDelete className='text-xl' />
            Discard Changes
          </Button>
          <Button color='success' onClick={save}>
            <MdSave className='text-xl' />
            Save Changes
          </Button>
        </Modal.Actions>
      </UnsavedDialog>
    </div>
  )
}
