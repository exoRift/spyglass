import { Fragment, useCallback, useMemo } from 'react'
import { usePromise } from 'react-exo-hooks'
import { createPortal } from 'react-dom'
import { twMerge } from 'tailwind-merge'
import type { Column } from 'knex-schema-inspector/dist/types/column'

import { DEFAULT_BARS_COLOR as DEFAULT_BAR_COLOR, DEFAULT_TRACE_COLORS, type Chart as ChartConfig } from '../../lib/config'

import { Button, Divider, Dropdown, Input, Join, Modal, Select, Toggle, Tooltip } from 'react-daisyui'
import { DebouncedInput } from '../components/DebouncedInput'
import { Multiselect } from '../components/Multiselect'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'

import { MdDelete, MdHelp, MdArrowUpward, MdAdd } from 'react-icons/md'

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
                Be sure to <code>return</code> an array of datapoints <code>&#123; x: any, y: number, lowBar?: number, highBar?: number &#125;</code>.
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

export function ChartEditPane ({ tables, editedChart, error }: { tables: Partial<Record<string, Column[]>> | null, editedChart: ChartConfig, error?: Error }): React.ReactNode {
  const { result: isForgeInstalled = true } = usePromise(() => () => hasDataForge(), [])

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

    return columns.map((c) => {
      const identifier = `${c.table}.${c.name}`

      return {
        ...c,
        identifier,
        display_name: columns.some((c2) => c2.name === c.name && c !== c2) ? identifier : c.name
      }
    })
  }, [tables, editedChart.table, editedChart.joins, +editedChart])

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

                  <Select size='xs' defaultValue={j.type} className='w-fit' onChange={(e) => { j.type = e.currentTarget.value as typeof j.type }}>
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
                    <Select defaultValue={j.baseColumn ?? ''} onChange={(e) => { j.baseColumn = e.currentTarget.value }} className='w-full' id={`join_${j.table}_base`} name={`join_${j.table}_base`}>
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
                    <Select defaultValue={j.foreignColumn ?? ''} onChange={(e) => { j.foreignColumn = e.currentTarget.value }} className='w-full' id={`join_${j.table}_foreign`} name={`join_${j.table}_foreign`}>
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
        <div className='fieldset w-full'>
          <label htmlFor='method' className='label'>
            <span className='label-text'>Datapoint Method</span>
          </label>
          <Select defaultValue={editedChart.method.type} onChange={(e) => editChart('method.type', e.currentTarget.value as ChartConfig['method']['type'])} className='w-full' id='method' name='method'>
            <Select.Option value='column'>Column Value</Select.Option>
            <Select.Option value='aggregate_count'>Aggregate by Count</Select.Option>
            <Select.Option value='aggregate_count_unique'>Aggregate by Unique Count</Select.Option>
            <Select.Option value='aggregate_sum'>Aggregate by Sum</Select.Option>
            <Select.Option value='aggregate_avg'>Aggregate by Average</Select.Option>
            <Select.Option value='custom'>Custom Map Function</Select.Option>
          </Select>
        </div>

        <div className='fieldset w-full'>
          <label htmlFor='type' className='label'>
            <span className='label-text'>Chart Style</span>
          </label>
          <Select defaultValue={editedChart.style} onChange={(e) => editChart('style', e.currentTarget.value as ChartConfig['style'])} className='w-full' id='type' name='type'>
            <Select.Option value='bar'>Bar</Select.Option>
            <Select.Option value='line'>Line</Select.Option>
            <Select.Option value='pie'>Pie</Select.Option>
          </Select>
        </div>
      </div>

      <div className='space-y-4 border-y border-base-content/50 rounded-sm py-2'>
        {(() => {
          switch (editedChart.method.type) {
            case 'value':
              return (
                <Fragment key='method'>
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
                </Fragment>
              )
            case 'aggregate_count':
              return (
                <Fragment key='method'>
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
                </Fragment>
              )
            case 'aggregate_count_unique':
              return (
                <Fragment key='method'>
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
                </Fragment>
              )
            case 'aggregate_sum':
              return (
                <Fragment key='method'>
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
                </Fragment>
              )
            case 'aggregate_avg':
              return (
                <Fragment key='method'>
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

                  {editedChart.style !== 'pie' && (
                    <div className='fieldset w-full'>
                      <label htmlFor='bars' className='label'>
                        <span className='label-text'>Error Bars</span>
                      </label>
                      <Select defaultValue={editedChart.method.bars ?? ''} onChange={(e) => editChart('method.bars', (e.currentTarget.value || null) as typeof editedChart.method.bars)} className='w-full' id='bars' name='bars'>
                        <Select.Option value=''>None</Select.Option>
                        <Select.Option value='stddev'>Standard Deviation</Select.Option>
                        <Select.Option value='minmax'>Minimum / Maximum</Select.Option>
                      </Select>
                    </div>
                  )}
                </Fragment>
              )
            case 'custom':
              return (
                <Fragment key='method'>
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
                    <DebouncedInput theme={matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'} extensions={[javascript()]} delay={500} className='font-mono' Comp={CodeMirror} id='mapFn' placeholder='JS Code...' value={editedChart.method.fn} onDebouncedChange={(v) => editChart('method.fn', v)} />
                    {!isForgeInstalled && (
                      <Button size='xs' color='neutral' onClick={() => (document.getElementById('forge-modal') as HTMLDialogElement).showModal()}>Install DataForge (optional)</Button>
                    )}
                    {error && (
                      <label className='label' htmlFor='mapFn'>
                        <span className='label-text text-error text-wrap'>{error.message}</span>
                      </label>
                    )}
                  </div>
                </Fragment>
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

      <div className='fieldset w-full'>
        <div className={twMerge('flex items-start justify-between gap-4', editedChart.style === 'pie' && 'justify-end')}>
          {editedChart.style !== 'pie' && (
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
              <Tooltip key={i} style={{ transitionDelay: `${i * 40}ms` }} message={`Trace ${i + 1}`} className={twMerge('transition-all duration-500 block transition-discrete opacity-100 starting:opacity-0', editedChart.breakdown === undefined && editedChart.style !== 'pie' && i > 0 && 'hidden opacity-0')}>
                <label style={{ backgroundColor: editedChart.traceColors?.[i] ?? DEFAULT_TRACE_COLORS[i] }} className='flex justify-center size-4 rounded-full cursor-pointer hover:ring focus-within:ring-2' htmlFor={`traceColors_${i}`}>
                  <input type='color' defaultValue={editedChart.traceColors?.[i] ?? DEFAULT_TRACE_COLORS[i]} onChange={(e) => { editedChart.traceColors ??= []; editedChart.traceColors[i] = e.currentTarget.value }} className='absolute opacity-0 pointer-events-none' id={`traceColors_${i}`} name={`traceColors_${i}`} />
                </label>
              </Tooltip>
            ))}

            {editedChart.method.type === 'aggregate_avg' && editedChart.method.bars && (
              <Tooltip message='Bars'>
                <label style={{ backgroundColor: editedChart.barColor ?? DEFAULT_BAR_COLOR }} className='flex justify-center size-4 rounded-sm cursor-pointer hover:ring focus-within:ring-2' htmlFor='barColor'>
                  <input type='color' defaultValue={editedChart.barColor ?? DEFAULT_BAR_COLOR} onChange={(e) => { editedChart.barColor = e.currentTarget.value }} className='absolute opacity-0 pointer-events-none' id='barColor' name='barColor' />
                </label>
              </Tooltip>
            )}
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
              <Select disabled={!editedChart.table} defaultValue={editedChart.sortCol ?? ''} onChange={(e) => editChart('sortCol', e.currentTarget.value)} className='w-full join-item' id='sortCol' name='sortCol'>
                <Select.Option value=''>No Order</Select.Option>

                {editedChart.method.type.includes('aggregate')
                  ? <Select.Option value='~aggregation'>Aggregation Value</Select.Option>
                  : null}
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
        )}
      </div>
    </>
  )
}
