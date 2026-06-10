import { Fragment, useCallback, useMemo } from 'react'
import { usePromise } from 'react-exo-hooks'
import { createPortal } from 'react-dom'
import { twMerge } from 'tailwind-merge'
import type { Column } from 'knex-schema-inspector/dist/types/column'

import type { Chart as ChartConfig } from '../../lib/config'
import { DEFAULT_BAR_COLOR, DEFAULT_TRACE_COLORS, getColumnIdentifier, getColumnNonConflictName, TIME_UNITS } from '../../lib/constants'

import { Button, Divider, Dropdown, Input, Join, Modal, Select, Toggle, Tooltip } from 'react-daisyui'
import { DebouncedInput } from '../components/DebouncedInput'
import { Multiselect } from '../components/Multiselect'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'

import { MdDelete, MdHelp, MdArrowUpward, MdAdd, MdSettings } from 'react-icons/md'

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
                Be sure to <code>return</code> an array of datapoints <code>&#123; x: any, y: number, lowBar?: number, highBar?: number, group?: string | number &#125;</code>.
                If <code>x</code> can be interpreted as a date from a string, it will be. <code>y</code> should be a number.
              </p>
              <p>
                You can optionally install <a className='link' href='https://www.npmjs.com/package/data-forge' target='_blank' rel='noreferrer' onClick={(e) => { e.preventDefault(); void window.openLink(e.currentTarget.href) }}>data-forge</a> and you will automatically be able to use it with the <code>forge</code> variable which is df's default export.
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

export function ChartEditPane ({ tables, editedChart, error }: { tables: Partial<Record<string, Column[]>> | null, editedChart: ChartConfig, error?: Error }): React.ReactNode {
  const { result: isForgeInstalled = true } = usePromise(() => () => window.hasDataForge(), [])

  const editChart = useCallback(<T extends FlattenObjectKeys<ChartConfig>> (field: T, value: NestedAccess<ChartConfig, T>): void => {
    if (typeof value === 'string') {
      value = value
        .replace(/[\u2014]/g, '--')               // emdash
        .replace(/[\u2022]/g, '*')                // bullet
        .replace(/[\u2018\u2019]/g, "'")          // smart single quotes
        .replace(/[\u201C\u201D]/g, '"') as any   // smart double quotes
    }

    if (field === 'table') {
      if ('x' in editedChart.method) editedChart.method.x = null
      if ('y' in editedChart.method) editedChart.method.y = null
      const x = document.getElementById('xColumn') as HTMLInputElement | null
      if (x) x.value = ''
      const y = document.getElementById('yColumn') as HTMLInputElement | null
      if (y) y.value = ''

      delete editedChart.joins
    }

    if (field === 'style' && value === 'pie') {
      editedChart.breakdown = undefined
      if ('bars' in editedChart.method) editedChart.method.bars = null
    }

    if (field === 'method.type') {
      const val = value as ChartConfig['method']['type']
      switch (val) {
        case 'aggregate_sum':
        case 'aggregate_count_unique':
        case 'value': editedChart.method = { type: val, x: null, y: null }; break
        case 'aggregate_count': editedChart.method = { type: val, x: null }; break
        case 'aggregate_avg': editedChart.method = { type: val, x: null, y: null, bars: null }; break
        case 'custom':
          editedChart.method = { type: val, columns: [], fn: '' }
          delete editedChart.sortCol
          delete editedChart.sortDesc
          break
      }
    } else {
      const accesses = field.split('.')
      let obj: any = editedChart
      while (accesses.length > 1) obj = obj[accesses.shift()!]
      obj[accesses[0]!] = value
    }
  }, [editedChart])

  const usableColumns = useMemo(() => {
    if (!tables || !editedChart.table) return

    let columns = tables[editedChart.table]
    if (!columns) return

    for (const join of editedChart.joins ?? []) {
      const table = tables[join.table]

      if (table) columns = columns.concat(table)
    }

    return columns.map((c) => ({
      ...c,
      identifier: getColumnIdentifier(c),
      display_name: getColumnNonConflictName(c, columns)
    }))
  }, [tables, editedChart.table, editedChart.joins, +editedChart])

  const xColumn = 'x' in editedChart.method ? usableColumns?.find((c) => c.identifier === (editedChart.method as typeof editedChart.method).x) : undefined
  const yColumn = 'y' in editedChart.method ? usableColumns?.find((c) => c.identifier === (editedChart.method as typeof editedChart.method).y) : undefined

  return (
    <>
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
        <Select value={editedChart.table ?? ''} onChange={(e) => editChart('table', e.currentTarget.value)} className='w-full' id='table' name='table'>
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
              <div key={j.table} className='transition transition-discrete starting:opacity-0 opacity-100'>
                <div className='flex gap-4 justify-between'>
                  <label className='font-semibold'>{j.table}</label>

                  <Select size='xs' value={j.type} className='w-fit' onChange={(e) => { j.type = e.currentTarget.value as typeof j.type }}>
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
                    <Select value={j.baseColumn ?? ''} onChange={(e) => { j.baseColumn = e.currentTarget.value }} className='w-full' id={`join_${j.table}_base`} name={`join_${j.table}_base`}>
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
                    <Select value={j.foreignColumn ?? ''} onChange={(e) => { j.foreignColumn = e.currentTarget.value }} className='w-full' id={`join_${j.table}_foreign`} name={`join_${j.table}_foreign`}>
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

                    <button className='self-center text-error text-xl cursor-pointer h-9' title='Delete' onClick={() => { if (editedChart.joins?.length === 1) delete editedChart.joins; else editedChart.joins?.splice(i, 1) }}>
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
                    : <Dropdown.Item key={t} onClick={() => { editedChart.joins ??= []; editedChart.joins.push({ table: t, type: 'inner', baseColumn: null, foreignColumn: null }); (document.activeElement as HTMLElement | null)?.blur() }}>{t}</Dropdown.Item>
                )))}
              </Dropdown.Menu>
            </Dropdown>
          </Divider>
        </div>
      </div>

      <div className='flex gap-4 *:grow'>
        <div className='fieldset'>
          <label htmlFor='method' className='label'>
            <span className='label-text'>Datapoint Method</span>
          </label>
          <Select value={editedChart.method.type} onChange={(e) => editChart('method.type', e.currentTarget.value as ChartConfig['method']['type'])} className='w-full' id='method' name='method'>
            <Select.Option value='column'>Column Value</Select.Option>
            <Select.Option value='aggregate_count'>Aggregate by Count</Select.Option>
            <Select.Option value='aggregate_count_unique'>Aggregate by Unique Count</Select.Option>
            <Select.Option value='aggregate_sum'>Aggregate by Sum</Select.Option>
            <Select.Option value='aggregate_avg'>Aggregate by Average</Select.Option>
            <Select.Option value='custom'>Custom Map Function</Select.Option>
          </Select>
        </div>

        <div className='fieldset w-fit'>
          <label htmlFor='type' className='label'>
            <span className='label-text'>Chart Style</span>
          </label>
          <Select value={editedChart.style} onChange={(e) => editChart('style', e.currentTarget.value as ChartConfig['style'])} className='w-full' id='type' name='type'>
            <Select.Option value='bar'>Bar</Select.Option>
            <Select.Option value='line'>Line</Select.Option>
            <Select.Option value='pie'>Pie</Select.Option>
          </Select>
        </div>
      </div>

      <div className='space-y-2 border-y border-base-content/50 rounded-sm py-2'>
        {editedChart.method.type !== 'custom' && (
          <section className='space-y-1'>
            <div className='flex gap-4 *:grow'>
              <div className='fieldset w-full'>
                <label htmlFor='xTitle' className='label'>
                  <span className='label-text'>X Axis Title</span>
                </label>
                <Input defaultValue={editedChart.xTitle} onChange={(e) => editChart('xTitle', e.currentTarget.value)} className='w-full' id='xTitle' name='xTitle' />
              </div>

              <div className='fieldset w-full'>
                <label htmlFor='table' className='label'>
                  <span className='label-text'>{editedChart.method.type.includes('aggregate') ? 'X Axis Grouping Column' : 'X Axis Column'}</span>
                </label>
                <Select disabled={!editedChart.table} value={editedChart.method.x ?? ''} onChange={(e) => editChart('method.x', e.currentTarget.value)} className='w-full' id='xColumn' name='xColumn'>
                  <Select.Option value='' disabled>Choose a column</Select.Option>

                  {(usableColumns?.map((c) => (
                    <Select.Option value={c.identifier} key={c.identifier}>{c.display_name}</Select.Option>
                  )))}
                </Select>
              </div>

              <div className='fieldset'>
                <label className='label invisible'>
                  <span className='label-text'>S</span>
                </label>

                <button onClick={() => { const details = document.getElementById('xSettings') as HTMLDetailsElement; details.open = !details.open }} className='transition group not-disabled:cursor-pointer disabled:opacity-50 flex items-center h-10' disabled={Boolean(xColumn?.data_type.match(/date|time/)) || typeof xColumn?.numeric_precision !== 'number'}>
                  <MdSettings className='text-2xl transition not:disabled:group-hover:-rotate-12 [section:not(:has(section)):has(&):has(details:open)_&]:text-secondary [section:not(:has(section)):has(&):has(details:open)_&]:rotate-45' />
                </button>
              </div>
            </div>
            <details id='xSettings' open={!editedChart.table ? false : undefined} className='transition-all bg-base-300 h-0 opacity-0 open:h-20 open:opacity-100 open:bg-base-300/0 overflow-hidden'>
              <summary className='hidden' />

              <div className='transition transition-discrete hidden [:open>&]:flex gap-4 *:grow starting:scale-75 scale-100'>
                {!xColumn?.data_type.match(/date|time/) && typeof xColumn?.numeric_precision === 'number' && (
                  <div className='fieldset w-full'>
                    <label htmlFor='xUnit' className='label'>
                      <span className='label-text'>X Axis Unit Type</span>
                    </label>
                    <Select value={editedChart.xUnit ?? ''} onChange={(e) => editChart('xUnit', e.currentTarget.value as typeof editedChart.xUnit || undefined)} className='w-full' id='xUnit' name='xUnit'>
                      <Select.Option value=''>Auto</Select.Option>
                      <Select.Option value='currency'>Currency</Select.Option>
                      <Select.Option value='percentage'>Percentage</Select.Option>
                    </Select>
                  </div>
                )}

                {xColumn?.data_type.match(/date|time/) && (
                  <div className='fieldset w-full'>
                    <label htmlFor='xTimeBin' className='label'>
                      <span className='label-text'>X Time Bin</span>
                    </label>
                    <Select value={editedChart.method.xTimeBin ?? ''} onChange={(e) => editChart('method.xTimeBin', (e.currentTarget.value as typeof editedChart.method.xTimeBin | '') || undefined)} id='xTimeBin' name='xTimeBin'>
                      <Select.Option value=''>None</Select.Option>

                      {TIME_UNITS.map((unit) => (
                        <Select.Option value={unit} key={unit}>{unit.slice(0, 1).toUpperCase() + unit.slice(1)}</Select.Option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>
            </details>
          </section>
        )}

        {(editedChart.method.type !== 'aggregate_count' && editedChart.method.type !== 'custom') && (
          <section className='space-y-1'>
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
                <Select disabled={!editedChart.table} value={editedChart.method.y ?? ''} onChange={(e) => editChart('method.y', e.currentTarget.value)} className='w-full' id='yColumn' name='yColumn'>
                  <Select.Option value='' disabled>Choose a column</Select.Option>

                  {(editedChart.method.type === 'aggregate_count_unique' ? usableColumns : usableColumns?.filter((c) => c.numeric_precision !== null))?.map((c) => (
                    <Select.Option value={c.identifier} key={c.identifier}>{c.display_name}</Select.Option>
                  ))}
                </Select>
              </div>

              <div className='fieldset'>
                <label className='label invisible'>
                  <span className='label-text'>S</span>
                </label>

                <button onClick={() => { const details = document.getElementById('ySettings') as HTMLDetailsElement; details.open = !details.open }} className='transition group not-disabled:cursor-pointer disabled:opacity-50 flex items-center h-10' disabled={Boolean(yColumn?.data_type.match(/date|time/)) || typeof yColumn?.numeric_precision !== 'number'}>
                  <MdSettings className='text-2xl transition not:disabled:group-hover:-rotate-12 [section:not(:has(section)):has(&):has(details:open)_&]:text-secondary [section:not(:has(section)):has(&):has(details:open)_&]:rotate-45' />
                </button>
              </div>
            </div>

            <details id='ySettings' open={!editedChart.table ? false : undefined} className='transition-all bg-base-300 h-0 opacity-0 open:h-20 open:opacity-100 open:bg-base-300/0 overflow-hidden'>
              <summary className='hidden' />

              <div className='transition transition-discrete hidden [:open>&]:flex gap-4 *:grow starting:scale-75 scale-100'>
                {!yColumn?.data_type.match(/date|time/) && typeof yColumn?.numeric_precision === 'number' && (
                  <div className='fieldset w-full'>
                    <label htmlFor='xUnit' className='label'>
                      <span className='label-text'>Y Axis Unit Type</span>
                    </label>
                    <Select value={editedChart.yUnit ?? ''} onChange={(e) => editChart('yUnit', e.currentTarget.value as typeof editedChart.yUnit || undefined)} className='w-full' id='yUnit' name='yUnit'>
                      <Select.Option value=''>Auto</Select.Option>
                      <Select.Option value='currency'>Currency</Select.Option>
                      <Select.Option value='percentage'>Percentage</Select.Option>
                    </Select>
                  </div>
                )}
              </div>
            </details>
          </section>
        )}

        {editedChart.method.type === 'aggregate_avg' && editedChart.style !== 'pie' && (
          <div className='fieldset w-full'>
            <label htmlFor='bars' className='label'>
              <span className='label-text'>Error Bars</span>
            </label>
            <Select disabled={Boolean(editedChart.cumulative)} value={editedChart.method.bars ?? ''} onChange={(e) => editChart('method.bars', (e.currentTarget.value || null) as typeof editedChart.method.bars)} className='w-full' id='bars' name='bars'>
              <Select.Option value=''>None</Select.Option>
              <Select.Option value='stddev'>Standard Deviation</Select.Option>
              <Select.Option value='minmax'>Minimum / Maximum</Select.Option>
            </Select>
          </div>
        )}

        {editedChart.method.type === 'custom' && (
          <>
            <div className='fieldset'>
              <label htmlFor='customColumns' className='label'>
                <span className='label-text'>Columns to Query</span>
              </label>
              <Multiselect disabled={!editedChart.table} defaultValue={editedChart.method.columns} onValueChange={(v) => editChart('method.columns', v)} className='w-full' color='ghost' unit='column' id='customColumns' name='customColumns'>
                {(usableColumns?.map((c) => (
                  <Multiselect.Option value={c.identifier} key={c.identifier}>{c.display_name.replaceAll('.', '_')}</Multiselect.Option>
                )))}
              </Multiselect>
            </div>

            <div className='fieldset'>
              <label htmlFor='mapFn' className='label'>
                <span className='label-text'>Map Function</span>
                <MapFunctionHelpButton />
              </label>
              <DebouncedInput theme={matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'} extensions={[javascript(), EditorView.lineWrapping]} delay={500} className='font-mono text-wrap' Comp={CodeMirror} id='mapFn' placeholder='JS Code...' value={editedChart.method.fn} onDebouncedChange={(v) => editChart('method.fn', v)} />
              {!isForgeInstalled && (
                <Button size='xs' color='neutral' onClick={() => (document.getElementById('forge-modal') as HTMLDialogElement).showModal()}>Install DataForge (optional)</Button>
              )}
              {error && (
                <label className='label' htmlFor='mapFn'>
                  <span className='label-text text-error text-wrap'>{error.message}</span>
                </label>
              )}
            </div>
          </>
        )}

        {editedChart.method.type !== 'custom' && editedChart.style !== 'pie' && (
          <div className='flex items-center gap-2 fieldset w-full'>
            <Toggle size='xs' color='primary' defaultChecked={editedChart.cumulative ?? false} onChange={(e) => editChart('cumulative', e.currentTarget.checked || undefined)} name='cumulative' id='cumulative' />
            <label htmlFor='cumulative' className='label transition [:checked+&]:text-primary'>
              <span className='label-text'>Cumulative</span>
            </label>
          </div>
        )}
      </div>

      <div className='fieldset w-full'>
        <label htmlFor='where' className='label'>
          <span className='label-text'>Filter</span>
        </label>
        <DebouncedInput delay={500} placeholder='Raw SQL WHERE Clause...' defaultValue={editedChart.where ?? ''} onDebouncedChange={(v) => editChart('where', v)} className='w-full' id='where' name='where' />
      </div>

      <div className='fieldset w-full'>
        <div className={twMerge('flex items-start justify-between gap-4', (editedChart.style === 'pie' || editedChart.method.type === 'custom') && 'justify-end')}>
          {editedChart.style !== 'pie' && editedChart.method.type !== 'custom' && (
            <div className='flex items-center gap-2'>
              <Toggle size='xs' color='secondary' defaultChecked={editedChart.breakdown !== undefined} onChange={(e) => editChart('breakdown', e.currentTarget.checked ? null : undefined)} id='breakdown_toggle' name='breakdown_toggle' />
              <label className='label [:checked+&]:text-secondary transition-colors' htmlFor='breakdown_toggle'>
                <span className='label-text'>Breakdown</span>
              </label>
            </div>
          )}

          <div className='flex justify-end items-center flex-wrap gap-2'>
            <label className='label'>
              <span className='label-text'>Colors</span>
            </label>

            {Array.from({ length: Math.max(editedChart.traceColors?.length ?? 0, DEFAULT_TRACE_COLORS.length) }, (_, i) => (
              <Tooltip key={i} style={{ transitionDelay: `${i * 40}ms` }} message={`Trace ${i + 1}`} className={twMerge('transition-all block transition-discrete opacity-100 starting:opacity-0', editedChart.breakdown === undefined && editedChart.style !== 'pie' && i > 0 && 'hidden opacity-0')}>
                <label style={{ backgroundColor: editedChart.traceColors?.[i] ?? DEFAULT_TRACE_COLORS[i] }} className='flex justify-center size-4 rounded-full cursor-pointer hover:ring focus-within:ring-2' htmlFor={`traceColors_${i}`}>
                  <input type='color' value={editedChart.traceColors?.[i] ?? DEFAULT_TRACE_COLORS[i]} onChange={(e) => { editedChart.traceColors ??= []; editedChart.traceColors[i] = e.currentTarget.value }} className='absolute opacity-0 pointer-events-none' id={`traceColors_${i}`} name={`traceColors_${i}`} />
                </label>
              </Tooltip>
            ))}

            {editedChart.method.type === 'aggregate_avg' && editedChart.method.bars && (
              <Tooltip message='Bars'>
                <label style={{ backgroundColor: editedChart.barColor ?? DEFAULT_BAR_COLOR }} className='flex justify-center size-4 rounded-sm cursor-pointer hover:ring focus-within:ring-2' htmlFor='barColor'>
                  <input type='color' value={editedChart.barColor ?? DEFAULT_BAR_COLOR} onChange={(e) => { editedChart.barColor = e.currentTarget.value }} className='absolute opacity-0 pointer-events-none' id='barColor' name='barColor' />
                </label>
              </Tooltip>
            )}
          </div>
        </div>

        <div className={twMerge('transition-all transition-discrete starting:bg-base-300 bg-base-300/0 starting:h-0 h-20', editedChart.breakdown === undefined && 'hidden h-0 overflow-hidden')}>
          <div className='transition-all transition-discrete fieldset starting:scale-75 scale-100'>
            <label className='label' htmlFor='breakdown'>
              <span className='label-text'>Breakdown Column</span>
            </label>

            <Select id='breakdown' name='breakdown' value={editedChart.breakdown ?? ''} onChange={(e) => editChart('breakdown', e.currentTarget.value)}>
              <Select.Option value='' disabled>Choose a column</Select.Option>

              {usableColumns?.map((c) => <Select.Option key={c.identifier} value={c.identifier}>{c.display_name}</Select.Option>)}
            </Select>
          </div>
        </div>
      </div>

      <div className='flex gap-4 *:grow'>
        <div className='fieldset w-full'>
          <label htmlFor='limit' className='label'>
            <span className='label-text'>Row Limit</span>
          </label>
          <DebouncedInput type='number' min={1} delay={500} placeholder='No Limit' defaultValue={editedChart.limit} onChange={(e) => e.currentTarget.reportValidity()} onDebouncedChange={(v) => editChart('limit', v ? parseInt(v) : undefined)} className='w-full invalid:input-error' id='limit' name='limit' />
        </div>

        {editedChart.method.type !== 'custom' && (
          <Join horizontal className='w-full'>
            <div className='fieldset'>
              <label htmlFor='sortCol' className='label'>
                <span className='label-text'>Order By</span>
              </label>
              <Select disabled={!editedChart.table} value={editedChart.sortCol ?? ''} onChange={(e) => editChart('sortCol', e.currentTarget.value)} className='w-full join-item' id='sortCol' name='sortCol'>
                <Select.Option value=''>No Order</Select.Option>

                {editedChart.method.type.includes('aggregate')
                  ? <Select.Option value='~aggregation'>Aggregation Value</Select.Option>
                  : null}
                {(usableColumns?.map((c) => (
                  <Select.Option value={c.identifier} key={c.identifier}>{c.display_name}</Select.Option>
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
        )}
      </div>
    </>
  )
}
