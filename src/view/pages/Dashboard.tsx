import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { twMerge } from 'tailwind-merge'
import * as echarts from 'echarts'
import { useMap, useObject, usePromise } from 'react-exo-hooks'
import type { Column } from 'knex-schema-inspector/dist/types/column'
import { createPortal } from 'react-dom'

import type { renderRoute } from '../index'
import type { Chart } from '../../lib/config'

import { type Layout, type WidgetProps, Dashboard as Dash } from 'dashup'
import { Alert, Button, Divider, Drawer, Dropdown, Form, Input, Join, Modal, Select, Tooltip } from 'react-daisyui'
import { DebouncedInput } from '../components/DebouncedInput'
import { Multiselect } from '../components/Multiselect'

import { MdArrowLeft, MdCable, MdDelete, MdDragHandle, MdHelp, MdSave, MdWarning, MdArrowUpward, MdAdd } from 'react-icons/md'
import 'dashup/style.css'

function Chart ({ chart, tables, canQuery, className, onContextMenu, width, height, onError }: { chart: Chart, tables: Partial<Record<string, Column[]>> | null, canQuery: boolean, height?: number, width?: number, onError?: (e: Error | undefined) => void } & Pick<React.ComponentProps<'div'>, 'className' | 'onContextMenu'>): React.ReactNode {
  const chartContainer = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.EChartsType>(undefined)
  const isAnimating = useRef(true)

  const [waiting, setWaiting] = useState(true)
  const [rows, setRows] = useState<any[]>([])

  const resize = useCallback(() => {
    function _resize (): void {
      requestAnimationFrame(() => chartRef.current?.resize())

      chartRef.current?.off('finished', _resize)
    }

    if (isAnimating.current) chartRef.current?.on('finished', _resize)
    else _resize()
  }, [])

  useEffect(() => {
    const aborter = new AbortController()

    const widget = chartContainer.current
      ?.closest('.dashup-widget')

    widget
      ?.addEventListener('transitionend', (e) => e.target === widget && setWaiting(false), { once: true, passive: true, signal: aborter.signal })

    return () => aborter.abort()
  }, [])

  useEffect(() => {
    if (waiting) return

    const theme = {
      backgroundColor: 'var(--color-base-200)',
      textStyle: {
        color: 'var(--color-base-content)'
      },
      title: {
        textStyle: {
          color: 'var(--color-base-content)'
        },
        subtextStyle: {
          color: 'var(--color-base-content)'
        }
      },
      legend: {
        textStyle: {
          color: 'var(--color-base-content)'
        }
      },
      tooltip: {
        axisPointer: {
          type: 'line',
          lineStyle: {
            color: 'var(--color-neutral)',
            type: 'dashed'
          },
          crossStyle: {
            color: 'var(--color-neutral)'
          },
          shadowStyle: {
            color: 'var(--color-neutral)'
          }
        },
        backgroundColor: 'var(--color-base-200)',
        borderColor: 'var(--color-neutral)',
        textStyle: {
          color: 'var(--color-base-content)'
        }
      },
      categoryAxis: {
        axisLine: {
          lineStyle: {
            color: 'var(--color-base-content)'
          }
        },
        axisLabel: {
          color: 'var(--color-base-content)'
        },
        splitLine: {
          lineStyle: {
            color: 'var(--color-base-300)'
          }
        }
      },
      valueAxis: {
        axisLine: {
          lineStyle: {
            color: 'var(--color-base-content)'
          }
        },
        axisLabel: {
          color: 'var(--color-base-content)'
        },
        splitLine: {
          lineStyle: {
            color: 'var(--color-base-300)'
          }
        }
      },
      pie: {
        label: {
          color: 'var(--color-base-content)'
        }
      }
    }

    const aborter = new AbortController()
    chartRef.current = echarts.init(chartContainer.current, theme, { renderer: 'svg' })
    chartRef.current.group = 'dashboard'
    echarts.connect('dashboard')

    const widget = chartContainer.current?.closest('.dashup-widget')
    widget
      ?.addEventListener(
        'transitionend',
        resize,
        { passive: true, signal: aborter.signal }
      )

    function onFinished (): void {
      isAnimating.current = false
    }

    function onTipShow (): void {
      widget?.classList.add('!overflow-visible')
    }
    function onTipHide (): void {
      widget?.classList.remove('!overflow-visible')
    }

    chartRef.current.on('finished', onFinished)
    chartRef.current.on('showTip', onTipShow)
    chartRef.current.on('hideTip', onTipHide)

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') chartRef.current?.setOption({ tooltip: { axisPointer: { type: 'cross' } } })
    }, { signal: aborter.signal, passive: true })
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') chartRef.current?.setOption({ tooltip: { axisPointer: { type: 'line' } } })
    }, { signal: aborter.signal, passive: true })

    return () => {
      aborter.abort()
      chartRef.current?.off('finished', onFinished)
      chartRef.current?.off('showTip', onTipShow)
      chartRef.current?.off('hideTip', onTipHide)
      chartRef.current?.dispose()
    }
  }, [waiting])

  useEffect(() => {
    const aborter = new AbortController()

    if (!chart.table || !canQuery) {
      setRows([])
      return
    }

    void queryRows(chart as typeof chart & { table: string })
      .then((r) => {
        if (aborter.signal.aborted) return

        if (typeof r === 'string') {
          setRows([])
          onError?.(new Error(r))
        } else if (r === null) {
          setRows([])
          onError?.(new Error('Failed to fetch data'))
        } else {
          setRows(r)
          onError?.(undefined)
        }
      })

    return () => aborter.abort()
  }, [canQuery, chart, (+chart - +chart.pos)])

  useEffect(() => {
    if (waiting) return

    isAnimating.current = true
    chartRef.current?.resize()

    let isTimeXAxis
    if (tables && chart.table && 'x' in chart.method && chart.method.x) {
      const x = chart.method.x

      const column = tables[chart.table]?.find((c) => c.name === x)
      isTimeXAxis = column?.data_type.includes('date') || column?.data_type.includes('time')
    } else isTimeXAxis = !isNaN(+new Date(rows[0]?.x))

    const figuredType = isTimeXAxis
      ? 'time'
      : 'category'
    chartRef.current?.setOption({
      animation: true,
      title: {
        text: chart.title || undefined,
        subtext: chart.subtitle || undefined,
        left: 'center'
      },
      tooltip: {
        trigger: chart.style === 'pie' ? 'item' : 'axis',
        formatter: chart.style === 'pie'
          ? (params: any) => {
            return `
              ${params.marker}
              ${params.name}<br/>
              <strong>${params.value.toLocaleString()}</strong>
              (<strong>${params.percent}%</strong>)
            `
          }
          : undefined
      },
      legend: {
        show: true,
        bottom: 8
      },
      grid: {
        left: '10%',
        right: '10%',
        bottom: figuredType === 'time' ? 80 : 40,
        containLabel: true
      },
      xAxis: {
        type: figuredType,
        axisLabel: {
          hideOverlap: true
        }
      },
      yAxis: {
        type: 'value',
        name: 'Value'
      },
      dataZoom: figuredType === 'time' && chart.style !== 'pie'
        ? {
          type: 'slider',
          xAxisIndex: [0],
          filterMode: 'filter',
          bottom: 38,
          height: '5%',
          labelFormatter: (v, aV) => new Date(aV).toLocaleDateString(undefined, { dateStyle: 'short' })
        }
        : undefined
    } satisfies echarts.EChartsOption)
  }, [waiting, rows, tables, chart.table, chart.title, chart.subtitle, chart.method, chart.style])

  useEffect(() => {
    if (waiting) return

    isAnimating.current = true
    chartRef.current?.resize()

    chartRef.current?.setOption({
      xAxis: chart.style === 'pie'
        ? undefined
        : {
          data: rows.map((r) => r.x)
        },
      series: [{
        name: 'Series 1',
        type: chart.style,
        data: chart.style === 'pie'
          ? rows.map((r) => ({ name: r.x, value: parseFloat(r.y) })).sort((a, b) => b.value - a.value)
          : rows.map((r) => ({ value: [r.x, parseFloat(r.y)] }))
      } satisfies echarts.SeriesOption]
    })
  }, [waiting, chart.style, rows])

  useEffect(() => {
    if (waiting) return

    requestAnimationFrame(resize)
  }, [width, height])

  return (
    <>
      <div className='transition-opacity absolute inset-x-0 flex justify-center bg-base-200 handle cursor-grab opacity-0 z-10 [.dashup-widget:hover_&]:opacity-100 [.dashup-widget[data-editing]_&]:hidden'>
        <MdDragHandle />
      </div>

      <div className={twMerge('flex h-full select-none', className)} onContextMenu={onContextMenu} onDoubleClick={(e) => e.stopPropagation()}>
        <div className='w-0 grow flex flex-col'>
          <div className='h-0 grow' ref={chartContainer} />
        </div>
      </div>

      <div className={twMerge('absolute inset-0 flex justify-center items-center text-center text-lg font-bold text-base-content/50 pointer-events-none', chart.table && 'hidden')}>Right click on me to edit my properties!</div>
    </>
  )
}

function MapFunctionHelpButton (): React.ReactNode {
  const { Dialog, handleShow } = Modal.useDialog()

  return (
    <>
      <button title='Map Function Help' className='cursor-pointer' onClick={handleShow}>
        <MdHelp />
      </button>

      {createPortal(
        (
          <Dialog>
            <Modal.Header>Custom Map Function</Modal.Header>
            <Modal.Body className='prose text-wrap text-sm text-justify space-y-4'>
              <p>
                This input takes JavaScript code.
                The <code>rows</code> variable contains all of the rows returned.
                The selected columns will be the ones chosen above (pay attention to dots being replaced with underscores).
              </p>
              <p>
                A column can be accessed with <code>rows[INDEX].COLUMN_NAME</code>.
                Be sure to <code>return</code> an array of datapoints <code>&#123; x, y &#125;</code>.
                If <code>x</code> can be interpreted as a date from a string, it will be. <code>y</code> should be a number.
              </p>
              <p>
                You can optionally install <a className='link' href='https://www.npmjs.com/package/data-forge' target='_blank' rel='noreferrer' onClick={(e) => { e.preventDefault(); void openLink(e.currentTarget.href) }}>data-forge</a> and you will automatically be able to use it with the <code>forge</code> variable which is df's default export.
              </p>
              <p>
                The <code>log</code> function will log your contents to the Spyglass console (run Spyglass from a command line to access)
              </p>
            </Modal.Body>
            <Modal.Actions>
              <form method='dialog'>
                <Button>Close</Button>
              </form>
            </Modal.Actions>
          </Dialog>
        ),
        document.body
      )}
    </>
  )
}

type Widen<T> = {
  [K in keyof T]: T[K] extends string ? string : T[K];
}
type UnionToIntersection<U> = (
  U extends any ? (k: Widen<U>) => void : never
) extends (k: infer I) => void
  ? I
  : never
type Autocomplete<T extends string> = T | (string & {})
type FlattenObjectKeys<T, Key extends keyof UnionToIntersection<T> = keyof UnionToIntersection<T>> = Key extends string
  ? UnionToIntersection<T>[Key] extends Record<string, unknown>
    ? Key | `${Key}.${FlattenObjectKeys<UnionToIntersection<T>[Key]>}`
    : Key
  : never
type NestedAccess<T, K extends Autocomplete<FlattenObjectKeys<T>> = FlattenObjectKeys<T>> = K extends `${infer V}.${infer U}`
  ? V extends keyof UnionToIntersection<T>
    ? U extends keyof UnionToIntersection<T>[V]
      ? UnionToIntersection<T>[V][U]
      : NestedAccess<UnionToIntersection<T>[V], U>
    : never
  : K extends keyof UnionToIntersection<T>
    ? UnionToIntersection<T>[K]
    : never

export default function Dashboard ({ navigate, connection: connIndex }: { navigate: typeof renderRoute, connection: number }): React.ReactNode {
  const [config, setConfig] = useObject(_config)
  const connection = config.connections[connIndex]!

  const {
    Dialog: UnsavedDialog,
    handleShow: promptUnsaved
  } = Modal.useDialog()

  const [dashKey, setDashKey] = useState(0)
  const [isUnsaved, setIsUnsaved] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [tables, setTables] = useState<Awaited<ReturnType<typeof getTables>>>({})
  const errors = useMap<number, Error | undefined>()
  const [connected, setConnected] = useState(false)

  const [password, setPassword] = useState<string>()
  const [passwordError, setPasswordError] = useState<string>()

  const { result: isForgeInstalled = true } = usePromise(() => () => hasDataForge(), [])

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
  }, [errors, +errors, connection, +config, config, connected, tables])

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
      xTitle: 'untitled x',
      yTitle: 'untitled y',
      method: {
        type: 'column',
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
      .then(() => setIsUnsaved(false))
      .then(() => setDashKey((prior) => prior + 1))
  }, [setConfig])

  const connect = useCallback((e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const pw = (data.get('password') as string | null) ?? ''

    setPasswordError(undefined)
    void testConnection(connection.client, {
      ...connection.details,
      password: pw
    })
      .then((r) => {
        if (r === null) setPasswordError('Could not connect. Is the password incorrect?')
        else setPassword(pw)
      })
  }, [connection])

  useEffect(() => {
    if (connection.details.password !== undefined || password !== undefined) {
      void setActiveConnection(connIndex, password)
        .then(getTables)
        .then(setTables)
        .then(() => setConnected(true))
    }
  }, [connection, connIndex, password])

  const editedChart = editing === null ? null : connection.charts[editing]!

  function editChart<T extends FlattenObjectKeys<Chart>> (field: T, value: NestedAccess<Chart, T>): void {
    if (editedChart) {
      if (field === 'table') {
        if ('x' in editedChart.method) editedChart.method.x = null
        if ('y' in editedChart.method) editedChart.method.y = null
        const x = document.getElementById('xColumn') as HTMLInputElement | null
        if (x) x.value = ''
        const y = document.getElementById('yColumn') as HTMLInputElement | null
        if (y) y.value = ''

        delete editedChart.joins
      } else if (field === 'method.fn' && typeof value === 'string') {
        value = value
          .replace(/[“”]/g, '"')
          .replace(/[‘’]/g, "'") as any
      }

      if (field === 'method.type') {
        const val = value as Chart['method']['type']
        switch (val) {
          case 'aggregate_sum':
          case 'column': editedChart.method = { type: val, x: null, y: null }; break
          case 'aggregate_count': editedChart.method = { type: val, x: null }; break
          case 'aggregate_count_unique': editedChart.method = { type: val, x: null, y: null }; break
          case 'custom': editedChart.method = { type: val, columns: [], fn: '' }; break
        }
      } else {
        const accesses = field.split('.')
        let obj: any = editedChart
        while (accesses.length > 1) obj = obj[accesses.shift()!]
        obj[accesses[0]!] = value
      }

      setIsUnsaved(true)
    }
  }

  const usableColumns = useMemo(() => {
    if (!tables || !editedChart?.table) return

    let columns = tables[editedChart.table]
    if (!columns) return

    for (const join of editedChart.joins ?? []) {
      const table = tables[join.table]

      if (table) columns = columns.concat(table)
    }

    return columns.map((c) => {
      const identifier = `${c.table}.${c.name}`

      return {
        ...c,
        identifier,
        display_name: columns.some((c2) => c2.name === c.name && c !== c2) ? identifier : c.name
      }
    })
  }, [tables, editedChart?.table, editedChart?.joins, +config])

  return (
    <div className='flex flex-col w-screen h-screen'>
      <Alert className={twMerge('transition fixed left-2 bottom-2 translate-y-4 opacity-0 z-50 pointer-events-none', tables === null && 'opacity-100 translate-y-0 pointer-events-auto')} icon={<MdWarning className='text-warning text-lg' />}>Spyglass cannot connect to the database</Alert>

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

      <div className='h-0 grow overflow-auto dark:[&_.resizable-handle]:!invert [&_.dashup-widget]:bg-base-200 [&_[data-last-edited]]:!z-20 [&_.dashup-widget_.wrapper]:!overflow-visible [&_.dashup-widget]:animate-[fade-in_0.5s_ease-out_forwards_normal]' onDoubleClick={createWidget}>
        <div className={twMerge('transition [&>.dashup]:empty:before:content-["Double_click_to_add_a_chart"] [&>.dashup]:before:text-base-content/30 [&>.dashup]:before:text-3xl [&>.dashup]:empty:flex [&>.dashup]:empty:justify-center [&>.dashup]:empty:items-center [&>.dashup]:empty:!h-full [&:has(.dashup:empty)]:h-full', editing !== null && '-translate-x-48')}>
          <Dash key={dashKey} widgets={charts} packing columns={100} rowHeight={1} placeholderClassName='!transition-none' onChange={updateWidgets} />
          <div className={twMerge('transition fixed min-h-screen inset-0 bg-black opacity-0 z-10 pointer-events-none', editing !== null && 'opacity-30')} />
        </div>
      </div>

      <Drawer
        open={editing !== null}
        side={editedChart
          ? (
            <div className='w-96 h-screen overflow-auto bg-base-200 p-6 space-y-4'>
              <div className='flex gap-4 items-center justify-between mb-4'>
                <h1 className='text-2xl font-bold'>Edit Chart</h1>

                <Tooltip color='error' message='Delete' position='left'>
                  <button className='text-error text-2xl cursor-pointer' onClick={() => { connection.charts.splice(editing!, 1); setEditing(null); setIsUnsaved(true) }}>
                    <MdDelete />
                  </button>
                </Tooltip>
              </div>

              <div className='fieldset w-full'>
                <label htmlFor='title' className='label'>
                  <span className='label-text'>Title</span>
                </label>
                <Input defaultValue={editedChart.title} onChange={(e) => editChart('title', e.currentTarget.value)} className='w-full' id='title' name='title' />
                <Input size='sm' defaultValue={editedChart.subtitle} onChange={(e) => editChart('subtitle', e.currentTarget.value)} className='w-full' id='subtitle' name='subtitle' placeholder='Subtitle...' />
              </div>

              <div className='fieldset w-full'>
                <label htmlFor='table' className='label'>
                  <span className='label-text'>Table</span>
                </label>
                <Select defaultValue={editedChart.table ?? ''} onChange={(e) => editChart('table', e.currentTarget.value)} className='w-full' id='table' name='table'>
                  <Select.Option value='' disabled>Choose a Table</Select.Option>

                  {(tables && Object.keys(tables).map((t) => (
                    <Select.Option value={t} key={t}>{t}</Select.Option>
                  )))}
                </Select>

                <div className='fieldset w-full'>
                  {Boolean(editedChart.joins?.length) && (
                    <Divider vertical>
                      <span className='text-sm'>Table Joins</span>
                    </Divider>
                  )}

                  <div className='flex flex-col gap-4'>
                    {editedChart.joins?.map((j, i) => (
                      <div key={j.table}>
                        <div className='flex gap-4 justify-between'>
                          <label className='font-semibold'>{j.table}</label>

                          <Select size='xs' defaultValue={j.type} className='w-fit' onChange={(e) => { j.type = e.currentTarget.value as typeof j.type; setIsUnsaved(true) }}>
                            <Select.Option value='inner'>Inner</Select.Option>
                            <Select.Option value='left'>Left</Select.Option>
                            <Select.Option value='right'>Right</Select.Option>
                          </Select>
                        </div>

                        <div className='flex gap-4'>
                          <div className='fieldset w-full grow'>
                            <label htmlFor={`join_${j.table}_base`} className='label'>
                              <span className='label-text'>Base Column</span>
                            </label>
                            <Select defaultValue={j.baseColumn ?? ''} onChange={(e) => { j.baseColumn = e.currentTarget.value; setIsUnsaved(true) }} className='w-full' id={`join_${j.table}_base`} name={`join_${j.table}_base`}>
                              <Select.Option value='' disabled>Choose a column</Select.Option>

                              {tables?.[editedChart.table ?? '']?.map((c) =>
                                <Select.Option key={c.name} value={c.name}>{c.name}</Select.Option>
                              )}
                            </Select>
                          </div>

                          <div className='fieldset w-full grow'>
                            <label htmlFor={`join_${j.table}_foreign`} className='label'>
                              <span className='label-text'>Foreign Column</span>
                            </label>
                            <Select defaultValue={j.foreignColumn ?? ''} onChange={(e) => { j.foreignColumn = e.currentTarget.value; setIsUnsaved(true) }} className='w-full' id={`join_${j.table}_foreign`} name={`join_${j.table}_foreign`}>
                              <Select.Option value='' disabled>Choose a column</Select.Option>

                              {tables?.[j.table]?.map((c) => (
                                <Select.Option key={c.name} value={c.name}>{c.name}</Select.Option>
                              ))}
                            </Select>
                          </div>

                          <div className='fieldset'>
                            <label className='invisible'>
                              <span className='label-text'>D</span>
                            </label>

                            <button className='self-center text-error text-xl cursor-pointer h-9' title='Delete' onClick={() => { if (editedChart.joins?.length === 1) delete editedChart.joins; else editedChart.joins?.splice(i, 1); setIsUnsaved(true) }}>
                              <MdDelete />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Divider vertical>
                    <Dropdown>
                      <Dropdown.Toggle disabled={!editedChart.table} className='has-[>:disabled]:pointer-events-none'>
                        <MdAdd />
                        <span>Table Join</span>
                      </Dropdown.Toggle>

                      <Dropdown.Menu>
                        {(tables && Object.keys(tables).map((t) => (
                          t === editedChart.table || editedChart.joins?.some((j) => j.table === t)
                            ? null
                            : <Dropdown.Item key={t} onClick={() => { editedChart.joins ??= []; editedChart.joins.push({ table: t, type: 'inner', baseColumn: null, foreignColumn: null }); setIsUnsaved(true); (document.activeElement as HTMLElement | null)?.blur() }}>{t}</Dropdown.Item>
                        )))}
                      </Dropdown.Menu>
                    </Dropdown>
                  </Divider>
                </div>
              </div>

              <div className='flex gap-4 *:grow'>
                <div className='fieldset w-full'>
                  <label htmlFor='method' className='label'>
                    <span className='label-text'>Datapoint Method</span>
                  </label>
                  <Select defaultValue={editedChart.method.type} onChange={(e) => editChart('method.type', e.currentTarget.value as Chart['method']['type'])} className='w-full' id='method' name='method'>
                    <Select.Option value='column'>Column Value</Select.Option>
                    <Select.Option value='aggregate_count'>Aggregate by Count</Select.Option>
                    <Select.Option value='aggregate_count_unique'>Aggregate by Unique Count</Select.Option>
                    <Select.Option value='aggregate_sum'>Aggregate by Sum</Select.Option>
                    <Select.Option value='custom'>Custom Map Function</Select.Option>
                  </Select>
                </div>

                <div className='fieldset w-full'>
                  <label htmlFor='type' className='label'>
                    <span className='label-text'>Chart Type</span>
                  </label>
                  <Select defaultValue={editedChart.style} onChange={(e) => editChart('style', e.currentTarget.value as Chart['style'])} className='w-full' id='type' name='type'>
                    <Select.Option value='bar'>Bar</Select.Option>
                    <Select.Option value='line'>Line</Select.Option>
                    <Select.Option value='pie'>Pie</Select.Option>
                  </Select>
                </div>
              </div>

              <div className='space-y-4 border-y border-base-content/50 rounded-sm py-2'>
                {(() => {
                  switch (editedChart.method.type) {
                    case 'column':
                      return (
                        <>
                          <div className='flex gap-4 *:grow'>
                            <div className='fieldset w-full'>
                              <label htmlFor='xTitle' className='label'>
                                <span className='label-text'>X Axis Title</span>
                              </label>
                              <Input defaultValue={editedChart.xTitle} onChange={(e) => editChart('xTitle', e.currentTarget.value)} className='w-full' id='xTitle' name='xTitle' />
                            </div>

                            <div className='fieldset w-full'>
                              <label htmlFor='table' className='label'>
                                <span className='label-text'>X Axis Column</span>
                              </label>
                              <Select disabled={!editedChart.table} defaultValue={editedChart.method.x ?? ''} onChange={(e) => editChart('method.x', e.currentTarget.value)} className='w-full' id='xColumn' name='xColumn'>
                                <Select.Option value='' disabled>Choose a column</Select.Option>

                                {(usableColumns?.map((c) => (
                                  <Select.Option value={c.display_name} key={c.display_name}>{c.display_name}</Select.Option>
                                )))}
                              </Select>
                            </div>
                          </div>

                          <div className='flex gap-4 *:grow'>
                            <div className='fieldset w-full'>
                              <label htmlFor='yTitle' className='label'>
                                <span className='label-text'>Y Axis Title</span>
                              </label>
                              <Input defaultValue={editedChart.yTitle} onChange={(e) => editChart('yTitle', e.currentTarget.value)} className='w-full' id='yTitle' name='yTitle' />
                            </div>

                            <div className='fieldset w-full'>
                              <label htmlFor='yColumn' className='label'>
                                <span className='label-text'>Y Axis Column</span>
                              </label>
                              <Select disabled={!editedChart.table} defaultValue={editedChart.method.y ?? ''} onChange={(e) => editChart('method.y', e.currentTarget.value)} className='w-full' id='yColumn' name='yColumn'>
                                <Select.Option value='' disabled>Choose a column</Select.Option>

                                {(usableColumns?.filter((c) => c.numeric_precision !== null).map((c) => (
                                  <Select.Option value={c.display_name} key={c.display_name}>{c.display_name}</Select.Option>
                                )))}
                              </Select>
                            </div>
                          </div>
                        </>
                      )
                    case 'aggregate_count':
                      return (
                        <>
                          <div className='flex gap-4 *:grow'>
                            <div className='fieldset w-full'>
                              <label htmlFor='xTitle' className='label'>
                                <span className='label-text'>X Axis Title</span>
                              </label>
                              <Input defaultValue={editedChart.xTitle} onChange={(e) => editChart('xTitle', e.currentTarget.value)} className='w-full' id='xTitle' name='xTitle' />
                            </div>

                            <div className='fieldset w-full'>
                              <label htmlFor='table' className='label'>
                                <span className='label-text'>X Axis Grouping Column</span>
                              </label>
                              <Select disabled={!editedChart.table} defaultValue={editedChart.method.x ?? ''} onChange={(e) => editChart('method.x', e.currentTarget.value)} className='w-full' id='xColumn' name='xColumn'>
                                <Select.Option value='' disabled>Choose a column</Select.Option>

                                {(usableColumns?.map((c) => (
                                  <Select.Option value={c.display_name} key={c.display_name}>{c.display_name}</Select.Option>
                                )))}
                              </Select>
                            </div>
                          </div>

                          <div className='fieldset w-full'>
                            <label htmlFor='yTitle' className='label'>
                              <span className='label-text'>Y Axis Title</span>
                            </label>
                            <Input defaultValue={editedChart.yTitle} onChange={(e) => editChart('yTitle', e.currentTarget.value)} className='w-full' id='yTitle' name='yTitle' />
                          </div>
                        </>
                      )
                    case 'aggregate_count_unique':
                      return (
                        <>
                          <div className='flex gap-4 *:grow'>
                            <div className='fieldset w-full'>
                              <label htmlFor='xTitle' className='label'>
                                <span className='label-text'>X Axis Title</span>
                              </label>
                              <Input defaultValue={editedChart.xTitle} onChange={(e) => editChart('xTitle', e.currentTarget.value)} className='w-full' id='xTitle' name='xTitle' />
                            </div>

                            <div className='fieldset w-full'>
                              <label htmlFor='table' className='label'>
                                <span className='label-text'>X Axis Column</span>
                              </label>
                              <Select disabled={!editedChart.table} defaultValue={editedChart.method.x ?? ''} onChange={(e) => editChart('method.x', e.currentTarget.value)} className='w-full' id='xColumn' name='xColumn'>
                                <Select.Option value='' disabled>Choose a column</Select.Option>

                                {(usableColumns?.map((c) => (
                                  <Select.Option value={c.display_name} key={c.display_name}>{c.display_name}</Select.Option>
                                )))}
                              </Select>
                            </div>
                          </div>

                          <div className='flex gap-4 *:grow'>
                            <div className='fieldset w-full'>
                              <label htmlFor='yTitle' className='label'>
                                <span className='label-text'>Y Axis Title</span>
                              </label>
                              <Input defaultValue={editedChart.yTitle} onChange={(e) => editChart('yTitle', e.currentTarget.value)} className='w-full' id='yTitle' name='yTitle' />
                            </div>

                            <div className='fieldset w-full'>
                              <label htmlFor='yColumn' className='label'>
                                <span className='label-text'>Y Axis Column</span>
                              </label>
                              <Select disabled={!editedChart.table} defaultValue={editedChart.method.y ?? ''} onChange={(e) => editChart('method.y', e.currentTarget.value)} className='w-full' id='yColumn' name='yColumn'>
                                <Select.Option value='' disabled>Choose a column</Select.Option>

                                {(usableColumns?.map((c) => (
                                  <Select.Option value={c.display_name} key={c.display_name}>{c.display_name}</Select.Option>
                                )))}
                              </Select>
                            </div>
                          </div>
                        </>
                      )
                    case 'aggregate_sum':
                      return (
                        <>
                          <div className='flex gap-4 *:grow'>
                            <div className='fieldset w-full'>
                              <label htmlFor='xTitle' className='label'>
                                <span className='label-text'>X Axis Title</span>
                              </label>
                              <Input defaultValue={editedChart.xTitle} onChange={(e) => editChart('xTitle', e.currentTarget.value)} className='w-full' id='xTitle' name='xTitle' />
                            </div>

                            <div className='fieldset w-full'>
                              <label htmlFor='table' className='label'>
                                <span className='label-text'>X Axis Column</span>
                              </label>
                              <Select disabled={!editedChart.table} defaultValue={editedChart.method.x ?? ''} onChange={(e) => editChart('method.x', e.currentTarget.value)} className='w-full' id='xColumn' name='xColumn'>
                                <Select.Option value='' disabled>Choose a column</Select.Option>

                                {(usableColumns?.map((c) => (
                                  <Select.Option value={c.display_name} key={c.display_name}>{c.display_name}</Select.Option>
                                )))}
                              </Select>
                            </div>
                          </div>

                          <div className='flex gap-4 *:grow'>
                            <div className='fieldset w-full'>
                              <label htmlFor='yTitle' className='label'>
                                <span className='label-text'>Y Axis Title</span>
                              </label>
                              <Input defaultValue={editedChart.yTitle} onChange={(e) => editChart('yTitle', e.currentTarget.value)} className='w-full' id='yTitle' name='yTitle' />
                            </div>

                            <div className='fieldset w-full'>
                              <label htmlFor='yColumn' className='label'>
                                <span className='label-text'>Y Axis Sum Column</span>
                              </label>
                              <Select disabled={!editedChart.table} defaultValue={editedChart.method.y ?? ''} onChange={(e) => editChart('method.y', e.currentTarget.value)} className='w-full' id='yColumn' name='yColumn'>
                                <Select.Option value='' disabled>Choose a column</Select.Option>

                                {(usableColumns?.filter((c) => c.numeric_precision !== null).map((c) => (
                                  <Select.Option value={c.display_name} key={c.display_name}>{c.display_name}</Select.Option>
                                )))}
                              </Select>
                            </div>
                          </div>
                        </>
                      )
                    case 'custom':
                      return (
                        <>
                          <div className='fieldset'>
                            <label htmlFor='customColumns' className='label'>
                              <span className='label-text'>Columns to Query</span>
                            </label>
                            <Multiselect disabled={!editedChart.table} defaultValue={editedChart.method.columns} onValueChange={(v) => editChart('method.columns', v)} className='w-full' color='ghost' unit='column' id='customColumns' name='customColumns'>
                              {(usableColumns?.map((c) => (
                                <Multiselect.Option value={c.display_name} key={c.display_name}>{c.display_name.replaceAll('.', '_')}</Multiselect.Option>
                              )))}
                            </Multiselect>
                          </div>

                          <div className='fieldset'>
                            <label htmlFor='mapFn' className='label'>
                              <span className='label-text'>Map Function</span>
                              <MapFunctionHelpButton />
                            </label>
                            <DebouncedInput delay={500} className='font-mono' Comp='textarea' id='mapFn' name='mapFn' placeholder='JS Code...' defaultValue={editedChart.method.fn} onDebouncedChange={(v) => editChart('method.fn', v)} />
                            {!isForgeInstalled && (
                              <Button size='xs' color='neutral' onClick={() => (document.getElementById('forge-modal') as HTMLDialogElement).showModal()}>Install DataForge (optional)</Button>
                            )}
                            {Boolean(editing && errors.get(editing)) && (
                              <label className='label' htmlFor='mapFn'>
                                <span className='label-text text-error text-wrap'>{errors.get(editing!)!.message}</span>
                              </label>
                            )}
                          </div>
                        </>
                      )
                  }
                })()}
              </div>

              <div className='fieldset w-full'>
                <label htmlFor='where' className='label'>
                  <span className='label-text'>Filter</span>
                </label>
                <DebouncedInput delay={500} placeholder='Raw SQL WHERE Clause...' defaultValue={editedChart.where} onDebouncedChange={(v) => editChart('where', v)} className='w-full' id='where' name='where' />
              </div>

              <div className='flex gap-4 *:grow'>
                <div className='fieldset w-full'>
                  <label htmlFor='limit' className='label'>
                    <span className='label-text'>Row Limit</span>
                  </label>
                  <DebouncedInput type='number' min={1} delay={500} placeholder='No Limit' defaultValue={editedChart.limit} onChange={(e) => e.currentTarget.reportValidity()} onDebouncedChange={(v) => editChart('limit', v ? parseInt(v) : undefined)} className='w-full invalid:input-error' id='limit' name='limit' />
                </div>

                <Join horizontal className='w-full'>
                  <div className='fieldset'>
                    <label htmlFor='sortCol' className='label'>
                      <span className='label-text'>Order By</span>
                    </label>
                    <Select disabled={!editedChart.table} defaultValue={editedChart.sortCol ?? ''} onChange={(e) => editChart('sortCol', e.currentTarget.value)} className='w-full join-item' id='sortCol' name='sortCol'>
                      <Select.Option value=''>No Order</Select.Option>

                      {(usableColumns?.map((c) => (
                        <Select.Option value={c.display_name} key={c.display_name}>{c.display_name}</Select.Option>
                      )))}
                    </Select>
                  </div>

                  <div className='fieldset'>
                    <label htmlFor='sortDesc' className='label'>
                      <span className='label-text'>Sort</span>
                    </label>
                    <label htmlFor='sortDesc' className='relative checkbox size-10 join-item'>
                      <input type='checkbox' hidden className='absolute' disabled={!editedChart.table} defaultChecked={editedChart.sortDesc || false} onChange={(e) => editChart('sortDesc', e.currentTarget.checked || undefined)} id='sortDesc' name='sortDesc' />
                      <MdArrowUpward className='transition [:has(:checked)>&]:-scale-y-100 absolute inset-0 size-full p-2' />
                    </label>
                  </div>
                </Join>
              </div>
            </div>
          )
          : null}
        sideClassName='z-30'
        overlayClassName='!bg-transparent'
        onClickOverlay={() => {
          const widgets = document.querySelectorAll('[data-editing]')
          widgets.forEach((w) => w.toggleAttribute('data-editing', false))
          setEditing(null)
        }}
        end
      />

      <Modal open={connection.details.password === undefined && password === undefined}>
        <Modal.Header>
          <span>Enter a password to access </span>
          <strong>{connection.name}</strong>
        </Modal.Header>

        <Modal.Body>
          <Form id='password_form' onSubmit={connect}>
            <div className='fieldset'>
              <Input placeholder='Enter Password...' name='password' id='password' type='password' className='w-full' />
              {passwordError && <label htmlFor='password' className='label text-error'>{passwordError}</label>}
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
