import { useCallback, useEffect, useMemo } from 'react'
import { usePromise } from 'react-exo-hooks'
import { createPortal } from 'react-dom'
import { twMerge } from 'tailwind-merge'

import type { Chart as ChartConfig, TimeUnit } from '../../lib/config'
import { DEFAULT_BAR_COLOR, DEFAULT_HEATMAP_COLORS, DEFAULT_TRACE_COLORS, getColumnNonConflictName, TIME_UNITS, type Table } from '../../lib/constants'

import { Button, Divider, Dropdown, Input, Join, Modal, Select, Toggle, Tooltip } from 'react-daisyui'
import { DebouncedInput } from '../components/DebouncedInput'
import { Multiselect } from '../components/Multiselect'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'

import { MdDelete, MdHelp, MdArrowUpward, MdAdd, MdSettings } from 'react-icons/md'
import { IoMdArrowDropdown } from 'react-icons/io'

const NUMERIC_TYPES = new Set([
  'smallint',
  'integer',
  'bigint',
  'decimal',
  'numeric',
  'real',
  'double precision',
  'smallserial',
  'serial',
  'bigserial',
  'expression'
])

type Widen<T> = {
  [K in keyof T]: T[K] extends string ? string : T[K]
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

/**
 * A help button that displays a guide to the custom map function
 */
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
                Be sure to <code>return</code> an array of datapoints.
                <code className='block'>
                  &#123;<br />
                  <span className='block ml-4'>
                    &#9;x: any,<br />
                    &#9;y: number,<br />
                    &#9;lowBar?: number,<br />
                    &#9;highBar?: number,<br />
                    &#9;group?: string | number -- Breakdown group<br />
                    &#9;style?: echarts.ItemStyleOption
                  </span>
                  &#125;
                </code>
                If <code>x</code> can be interpreted as a date from a string, it will be. <code>y</code> should be a number.<br />
                <a className='link' href='https://echarts.apache.org/en/option.html#series-line.itemStyle' target='_blank' rel='noreferrer' onClick={(e) => { e.preventDefault(); void window.openLink(e.currentTarget.href) }}>Echarts <code>itemStyle</code> Documentation</a>
              </p>
              <p>
                You can optionally install <a className='link' href='https://www.npmjs.com/package/data-forge' target='_blank' rel='noreferrer' onClick={(e) => { e.preventDefault(); void window.openLink(e.currentTarget.href) }}>data-forge</a> and you will automatically be able to use it with the <code>forge</code> variable which is df's default export.
              </p>
              <p>
                The <code>log</code> function will log your contents to the Spyglass console (run Spyglass from a command line to access)
              </p>
            </Modal.Body>
            <Modal.Actions>
              <form method='dialog' className='contents'>
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

/**
 * Replace the fancy characters inputs/textareas add to values with ones that are safe for JS eval
 * @param string The input
 * @returns      The santitized output
 */
function replaceFancyCharacters (string: string): string {
  return string
    .replace(/[\u2014]/g, '--')        // emdash
    .replace(/[\u2022]/g, '*')         // bullet
    .replace(/[\u2018\u2019]/g, "'")   // smart single quotes
    .replace(/[\u201C\u201D]/g, '"')   // smart double quotes
}

const PasteListener = EditorView.domEventHandlers({
  paste () {
    if (!window._config.dismissedWarnings.includes('custompaste')) {
      (document.getElementById('custompaste-modal') as HTMLDialogElement).showModal()
      return true
    }

    return false
  }
})

/**
 * A pane for configuring nearly everything in a chart
 * @todo Reset ForceXAsDate on change
 * @todo Only set fields to null if they're no longer supported, rather than always and on certain changes (sortCol)
 * @param props
 * @param props.tables      The available tables that can be used
 * @param props.editedChart A reference to the chart this pane is editing
 * @param props.error       An error to display under the custom map function editor
 */
export function ChartEditPane ({ tables, editedChart, error }: { tables: Record<string, Table> | null, editedChart: ChartConfig, error?: Error }): React.ReactNode {
  const { result: isForgeInstalled = true, rerun: recheckForge } = usePromise(() => () => window.hasModule('data-forge'), [])

  const editChart = useCallback(<T extends FlattenObjectKeys<ChartConfig>> (field: T, value: NestedAccess<ChartConfig, T>): void => {
    if (typeof value === 'string') value = replaceFancyCharacters(value) as any
    if (typeof value === 'number' && isNaN(value)) value = undefined as any

    if (field === 'table') {
      if ('x' in editedChart.method) editedChart.method.x = null
      if ('y' in editedChart.method) editedChart.method.y = null
      const x = document.getElementById('xColumn') as HTMLInputElement | null
      if (x) x.value = ''
      const y = document.getElementById('yColumn') as HTMLInputElement | null
      if (y) y.value = ''

      delete editedChart.joins
    }

    if (field === 'style') {
      if (value === 'pie') {
        editedChart.breakdown = undefined
        if ('bars' in editedChart.method) editedChart.method.bars = null
        if (editedChart.yUnit === 'percentage') editedChart.yUnit = undefined
      } else if (value === 'heatmap') {
        editedChart.breakdown = undefined
        editedChart.forceXAsDate = true
        if ('bars' in editedChart.method) editedChart.method.bars = null
        editedChart.sortCol = undefined
        editedChart.sortDesc = undefined
      }
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

    let columns = tables[editedChart.table]?.columns
    if (!columns) return

    for (const join of editedChart.joins ?? []) {
      const table = tables[join.table]

      if (table) columns = columns.concat(table.columns)
    }

    if (editedChart.expressions) {
      columns = columns.concat(Object.entries(editedChart.expressions).map(([name, expression]) => ({
        name,
        identifier: `~expr:${name}`,
        data_type: 'expression',
        default_value: null,
        foreign_key_column: null,
        foreign_key_table: null,
        has_auto_increment: false,
        is_generated: true,
        is_nullable: true,
        is_primary_key: false,
        is_unique: false,
        max_length: null,
        table: editedChart.table!,
        numeric_precision: null,
        numeric_scale: null,
        comment: null,
        foreign_key_schema: null,
        generation_expression: expression,
        schema: tables[editedChart.table!]!.schema
      })))
    }

    return columns.map((c) => ({
      ...c,
      display_name: c.data_type === 'expression' ? c.name : getColumnNonConflictName(c, columns)
    }))
  }, [tables, editedChart.table, editedChart.joins, editedChart.expressions])

  useEffect(() => {
    const aborter = new AbortController()

    window.addEventListener('moduleinstalled', recheckForge, { signal: aborter.signal })

    return () => aborter.abort()
  }, [recheckForge])

  const xColumn = 'x' in editedChart.method ? usableColumns?.find((c) => c.identifier === (editedChart.method as typeof editedChart.method).x) : undefined
  const yColumn = 'y' in editedChart.method ? usableColumns?.find((c) => c.identifier === (editedChart.method as typeof editedChart.method).y) : undefined

  return (
    <>
      <div className='fieldset w-full'>
        <label htmlFor='title' className='label'>
          <span className='label-text'>Title</span>
        </label>
        <Input value={editedChart.title} onChange={(e) => editChart('title', e.currentTarget.value)} className='w-full' id='title' name='title' />
        <Input size='sm' value={editedChart.subtitle} onChange={(e) => editChart('subtitle', e.currentTarget.value)} className='w-full' id='subtitle' name='subtitle' placeholder='Subtitle...' />
      </div>

      {error && editedChart.method.type !== 'custom' && createPortal(
        (
          <label className='absolute block max-w-96 left-2 bottom-2 label'>
            <span className='label-text text-xs text-error text-wrap'>{error.message}</span>
          </label>
        ),
        document.body
      )}

      <div className='fieldset w-full'>
        <label htmlFor='table' className='label'>
          <span className='label-text'>Table</span>
        </label>
        <Select value={editedChart.table ?? ''} onChange={(e) => editChart('table', e.currentTarget.value)} className='w-full' id='table' name='table'>
          <Select.Option value='' disabled>Choose a Table</Select.Option>

          {(tables && Object.values(tables).map((t) => (
            <Select.Option value={t.identifier} key={t.identifier}>{t.display_name}</Select.Option>
          )))}
        </Select>

        <div className='fieldset w-full'>
          {Boolean(editedChart.joins?.length) && (
            <Divider vertical>
              <span className='text-sm font-semibold'>Table Joins</span>
            </Divider>
          )}

          <div className='flex flex-col gap-4'>
            {editedChart.joins?.map((j, i) => (
              <div key={j.table} className='transition transition-discrete starting:opacity-0 opacity-100'>
                <div className='flex gap-4 justify-between'>
                  <label className='font-semibold'>{tables?.[j.table]?.display_name ?? j.table}</label>

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

                      {usableColumns?.filter((c) => c.table !== j.table).map((c) =>
                        <Select.Option key={c.identifier} value={c.identifier}>{c.display_name}</Select.Option>
                      )}
                    </Select>
                  </div>

                  <div className='fieldset w-full grow'>
                    <label htmlFor={`join_${j.table}_foreign`} className='label'>
                      <span className='label-text'>Foreign Column</span>
                    </label>
                    <Select value={j.foreignColumn ?? ''} onChange={(e) => { j.foreignColumn = e.currentTarget.value }} className='w-full' id={`join_${j.table}_foreign`} name={`join_${j.table}_foreign`}>
                      <Select.Option value='' disabled>Choose a column</Select.Option>

                      {usableColumns?.filter((c) => c.table === j.table).map((c) => (
                        <Select.Option key={c.identifier} value={c.identifier}>{c.display_name}</Select.Option>
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
                {(tables && Object.values(tables).map((t) => (
                  t.identifier === editedChart.table || editedChart.joins?.some((j) => j.table === t.identifier)
                    ? null
                    : <Dropdown.Item key={t.identifier} onClick={() => { editedChart.joins ??= []; editedChart.joins.push({ table: t.identifier, type: 'inner', baseColumn: null, foreignColumn: null }); (document.activeElement as HTMLElement | null)?.blur() }}>{t.display_name}</Dropdown.Item>
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
            <Select.Option value='value'>Column Value</Select.Option>
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
          <Select value={editedChart.style} onChange={(e) => editChart('style', e.currentTarget.value as ChartConfig['style'])} className='w-fit' id='type' name='type'>
            <Select.Option value='bar'>Bar</Select.Option>
            <Select.Option value='line'>Line</Select.Option>
            <Select.Option value='pie'>Pie</Select.Option>
            <Select.Option value='heatmap'>Heatmap</Select.Option>
          </Select>
        </div>
      </div>

      <div className='space-y-2 border-y border-base-content/50 rounded-sm py-2'>
        <div className='w-full'>
          <div className='flex items-center gap-2'>
            <Button disabled={!editedChart.table} className='grow' size='xs' color='accent' onClick={() => { const details = document.getElementById('expressions') as HTMLDetailsElement; details.open = !details.open }}>
              <IoMdArrowDropdown className='transition text-xl [:has(>*>&):has(+:open)_&]:rotate-0 -rotate-90' />
              Custom Expressions
              <IoMdArrowDropdown className='transition text-xl [:has(>*>&):has(+:open)_&]:rotate-0 rotate-90' />
            </Button>

            <Tooltip position='left' className='cursor-help' message='Define raw SQL snippets that can be used in any field that normally takes a column'>
              <MdHelp className='text-lg' />
            </Tooltip>
          </div>

          <details id='expressions' open={!editedChart.table ? false : undefined} className='transition-all bg-base-300 h-0 opacity-0 open:h-32 open:opacity-100 open:bg-base-300/20 overflow-auto scrollbar-gutter-stable!'>
            <summary className='hidden' />

            <div className='transition-all transition-discrete hidden [:open>&]:block gap-4 starting:scale-75 scale-100 px-4 py-2 space-y-2'>
              {editedChart.expressions && Object.entries(editedChart.expressions).map(([name, expression]) => (
                <div key={name} className='flex gap-2'>
                  <dt className='p-1 text-xs font-semibold'>{name}</dt>
                  <code className='grow bg-base-300 p-1 font-mono text-xs overflow-auto'>{expression}</code>

                  <button
                    className='cursor-pointer'
                    title='Remove'
                    onClick={() => {
                      delete editedChart.expressions![name]

                      if (editedChart.breakdown === `~expr:${name}`) editedChart.breakdown = undefined
                      if (editedChart.sortCol === `~expr:${name}`) editedChart.sortCol = undefined
                      if ('x' in editedChart.method && editedChart.method.x === `~expr:${name}`) editedChart.method.x = null
                      if ('y' in editedChart.method && editedChart.method.y === `~expr:${name}`) editedChart.method.y = null
                      if (editedChart.method.type === 'custom') {
                        const index = editedChart.method.columns.indexOf(`~expr:${name}`)
                        if (index !== -1) editedChart.method.columns.splice(index, 1)
                      }

                      if (!Object.keys(editedChart.expressions).length) editedChart.expressions = undefined
                    }}
                  >
                    <MdDelete className='text-base text-error' />
                  </button>
                </div>
              ))}

              <form
                className='flex join join-horizontal'
                onSubmit={(e) => {
                  e.preventDefault()
                  const expressionInput = (document.getElementById('custom_expression_value')) as HTMLInputElement
                  const nameInput = (document.getElementById('custom_expression_name')) as HTMLInputElement

                  if (editedChart.expressions && Object.values(editedChart.expressions).includes(expressionInput.value)) {
                    expressionInput.setCustomValidity('This expression is already in the list')
                  } else if (usableColumns?.some((c) => c.display_name === expressionInput.value)) {
                    expressionInput.setCustomValidity('Expression cannot be a column name')
                  }

                  if (editedChart.expressions && nameInput.value in editedChart.expressions) {
                    nameInput.setCustomValidity('Name is already in use')
                  } else if (usableColumns?.some((c) => c.display_name === nameInput.value)) {
                    nameInput.setCustomValidity('Name cannot be a column name')
                  }

                  if (!e.currentTarget.reportValidity()) return

                  editedChart.expressions ??= {}
                  editedChart.expressions[nameInput.value] = replaceFancyCharacters(expressionInput.value)
                  e.currentTarget.reset()
                }}
              >
                <Input
                  id='custom_expression_name'
                  name='custom_expression_name'
                  placeholder='Name...'
                  size='xs'
                  className='join-item not-placeholder-shown:invalid:input-error w-16'
                  required
                  onChange={(e) => e.currentTarget.setCustomValidity('')}
                />
                <Input
                  id='custom_expression_value'
                  name='custom_expression_value'
                  placeholder='Add Expression (Raw SQL)...'
                  size='xs'
                  className='join-item font-mono not-placeholder-shown:invalid:input-error'
                  required
                  onChange={(e) => e.currentTarget.setCustomValidity('')}
                />

                <Button
                  type='submit'
                  color='primary'
                  size='xs'
                  title='Add'
                  className='join-item'
                >
                  <MdAdd className='text-lg' />
                </Button>
              </form>
            </div>
          </details>
        </div>

        <section className='space-y-1'>
          <div className='flex gap-4 *:grow'>
            <div className='fieldset w-full'>
              <label htmlFor='xTitle' className='label'>
                <span className='label-text'>X Axis Title</span>
              </label>
              <Input value={editedChart.xTitle} onChange={(e) => editChart('xTitle', e.currentTarget.value)} className='w-full' id='xTitle' name='xTitle' />
            </div>

            <div className='fieldset w-full'>
              <label htmlFor='table' className='label'>
                <span className='label-text'>{editedChart.method.type.includes('aggregate') ? 'X Axis Grouping Column' : 'X Axis Column'}</span>
              </label>
              <Select disabled={!editedChart.table || editedChart.method.type === 'custom'} value={editedChart.method.type === 'custom' ? '' : editedChart.method.x ?? ''} onChange={(e) => editChart('method.x', e.currentTarget.value)} className='w-full' id='xColumn' name='xColumn'>
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

              <button onClick={() => { const details = document.getElementById('xSettings') as HTMLDetailsElement; details.open = !details.open }} className='transition group not-disabled:cursor-pointer disabled:opacity-50 flex items-center h-10'>
                <MdSettings className='text-2xl transition not-disabled:group-hover:-rotate-12 [section:not(:has(section)):has(&):has(details:open)_&]:text-secondary [section:not(:has(section)):has(&):has(details:open)_&]:rotate-45' />
              </button>
            </div>
          </div>
          <details id='xSettings' open={!editedChart.table || !xColumn || !NUMERIC_TYPES.has(xColumn.data_type) ? false : undefined} className='transition-all bg-base-300 h-0 opacity-0 open:h-24 open:opacity-100 open:bg-base-300/0 overflow-hidden'>
            <summary className='hidden' />

            <div className='transition transition-discrete hidden [:open>&]:block *:grow starting:scale-75 scale-100'>
              <div className='flex items-center gap-2 fieldset w-full'>
                <Toggle disabled={editedChart.style === 'heatmap'} size='xs' color='secondary' checked={editedChart.forceXAsDate ?? false} onChange={(e) => editChart('forceXAsDate', e.currentTarget.checked || undefined)} name='forceXAsDate' id='forceXAsDate' />
                <label htmlFor='forceXAsDate' className='label transition [:checked+&]:text-primary'>
                  <span className='label-text [:disabled+*>&]:opacity-60'>Force X as date</span>
                </label>
              </div>

              <div className='flex gap-4'>
                {xColumn && NUMERIC_TYPES.has(xColumn.data_type) && (
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

                {(xColumn?.data_type.match(/date|time|expression/) || editedChart.forceXAsDate) && (
                  <div className='fieldset w-full'>
                    <label htmlFor='xTimeBin' className='label'>
                      <span className='label-text'>X Time Bin</span>
                    </label>
                    <Select disabled={editedChart.method.type === 'custom'} value={editedChart.method.type === 'custom' ? '' : editedChart.method.xTimeBin ?? ''} onChange={(e) => editChart('method.xTimeBin', (e.currentTarget.value as TimeUnit | '') || undefined)} id='xTimeBin' name='xTimeBin'>
                      <Select.Option value=''>None</Select.Option>

                      {TIME_UNITS.map((unit) => (
                        <Select.Option disabled={unit === 'weekday' && editedChart.style === 'heatmap'} value={unit} key={unit}>{unit.slice(0, 1).toUpperCase() + unit.slice(1)}</Select.Option>
                      ))}
                    </Select>
                  </div>
                )}

                <div className='fieldset w-full'>
                  <label htmlFor='xLabelAngle' className='label'>
                    <span className='label-text'>X Label Angle</span>
                  </label>
                  <Input disabled={editedChart.style === 'heatmap'} type='number' placeholder={'0\u00b0'} value={editedChart.xLabelAngle?.toString() ?? ''} onChange={(e) => editChart('xLabelAngle', e.currentTarget.valueAsNumber)} />
                </div>
              </div>
            </div>
          </details>
        </section>

        <section className='space-y-1'>
          <div className='flex gap-4 *:grow'>
            <div className='fieldset w-full'>
              <label htmlFor='yTitle' className='label'>
                <span className='label-text'>Y Axis Title</span>
              </label>
              <Input value={editedChart.yTitle} onChange={(e) => editChart('yTitle', e.currentTarget.value)} className='w-full' id='yTitle' name='yTitle' />
            </div>

            <div className='fieldset w-full'>
              <label htmlFor='yColumn' className='label'>
                <span className='label-text'>Y Axis Column</span>
              </label>
              <Select disabled={!editedChart.table || editedChart.method.type === 'aggregate_count' || editedChart.method.type === 'custom'} value={editedChart.method.type === 'aggregate_count' || editedChart.method.type === 'custom' ? '' : editedChart.method.y ?? ''} onChange={(e) => editChart('method.y', e.currentTarget.value)} className='w-full' id='yColumn' name='yColumn'>
                <Select.Option value='' disabled>Choose a column</Select.Option>

                {(editedChart.method.type === 'aggregate_count_unique' ? usableColumns : usableColumns?.filter((c) => NUMERIC_TYPES.has(c.data_type)))?.map((c) => (
                  <Select.Option value={c.identifier} key={c.identifier}>{c.display_name}</Select.Option>
                ))}
              </Select>
            </div>

            <div className='fieldset'>
              <label className='label invisible'>
                <span className='label-text'>S</span>
              </label>

              <button onClick={() => { const details = document.getElementById('ySettings') as HTMLDetailsElement; details.open = !details.open }} className='transition group not-disabled:cursor-pointer disabled:opacity-50 flex items-center h-10' disabled={!yColumn || !NUMERIC_TYPES.has(yColumn.data_type)}>
                <MdSettings className='text-2xl transition not-disabled:group-hover:-rotate-12 [section:not(:has(section)):has(&):has(details:open)_&]:text-secondary [section:not(:has(section)):has(&):has(details:open)_&]:rotate-45' />
              </button>
            </div>
          </div>

          <details id='ySettings' open={!editedChart.table || !yColumn || !NUMERIC_TYPES.has(yColumn.data_type) ? false : undefined} className='transition-all bg-base-300 h-0 opacity-0 open:h-20 open:opacity-100 open:bg-base-300/0 overflow-hidden'>
            <summary className='hidden' />

            <div className='transition transition-discrete hidden [:open>&]:flex gap-4 *:grow starting:scale-75 scale-100'>
              {yColumn && NUMERIC_TYPES.has(yColumn.data_type) && (
                <div className='fieldset w-full'>
                  <label htmlFor='xUnit' className='label'>
                    <span className='label-text'>Y Axis Unit Type</span>
                  </label>
                  <Select value={editedChart.yUnit ?? ''} onChange={(e) => editChart('yUnit', e.currentTarget.value as typeof editedChart.yUnit || undefined)} className='w-full' id='yUnit' name='yUnit'>
                    <Select.Option value=''>Auto</Select.Option>
                    <Select.Option value='currency'>Currency</Select.Option>
                    <Select.Option value='percentage' disabled={editedChart.style === 'pie'}>Percentage</Select.Option>
                  </Select>
                </div>
              )}
            </div>
          </details>
        </section>

        {editedChart.method.type === 'aggregate_avg' && editedChart.style !== 'pie' && editedChart.style !== 'heatmap' && (
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
              <Multiselect disabled={!editedChart.table} value={editedChart.method.columns} onValueChange={(v) => editChart('method.columns', v)} className='w-full' color='ghost' unit='column' id='customColumns' name='customColumns'>
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
              <DebouncedInput
                theme={matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'}
                extensions={[javascript(), EditorView.lineWrapping, PasteListener]}
                delay={500}
                className='font-mono text-wrap'
                Comp={CodeMirror}
                id='mapFn'
                placeholder='JS Code...'
                value={editedChart.method.fn}
                onDebouncedChange={(v) => editChart('method.fn', v)}
              />
              {!isForgeInstalled && (
                <Button size='xs' color='neutral' onClick={() => window.alertMissingDriver?.('data-forge')}>Install DataForge (optional)</Button>
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
            <Toggle size='xs' color='primary' checked={editedChart.cumulative ?? false} onChange={(e) => editChart('cumulative', e.currentTarget.checked || undefined)} name='cumulative' id='cumulative' />
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
        <DebouncedInput
          delay={500}
          placeholder='Raw SQL WHERE Clause...'
          value={editedChart.where ?? ''}
          onDebouncedChange={(v) => editChart('where', v)}
          className='w-full'
          id='where'
          name='where'
          autoCapitalize='off'
          autoComplete='off'
          autoCorrect='off'
          spellCheck='false'
        />
      </div>

      <div className='fieldset w-full'>
        <div className={twMerge('flex items-start justify-between gap-4', (editedChart.style === 'pie' || editedChart.style === 'heatmap' || editedChart.method.type === 'custom') && 'justify-end')}>
          {editedChart.style !== 'pie' && editedChart.style !== 'heatmap' && editedChart.method.type !== 'custom' && (
            <div className='flex items-center gap-2'>
              <Toggle size='xs' color='secondary' checked={editedChart.breakdown !== undefined} onChange={(e) => editChart('breakdown', e.currentTarget.checked ? null : undefined)} id='breakdown_toggle' name='breakdown_toggle' />
              <label className='label [:checked+&]:text-secondary transition-colors' htmlFor='breakdown_toggle'>
                <span className='label-text'>Breakdown</span>
              </label>
            </div>
          )}

          <div className='flex justify-end items-center flex-wrap gap-2'>
            <label className='label'>
              <span className='label-text'>Colors</span>
            </label>

            {editedChart.style !== 'heatmap' && Array.from({ length: Math.max(editedChart.traceColors?.length ?? 0, DEFAULT_TRACE_COLORS.length) }, (_, i) => (
              <Tooltip key={i} style={{ transitionDelay: `${i * 40}ms` }} message={`Trace ${i + 1}`} className={twMerge('transition-all block transition-discrete opacity-100 starting:opacity-0', editedChart.breakdown === undefined && editedChart.style !== 'pie' && i > 0 && 'hidden opacity-0')}>
                <label style={{ backgroundColor: editedChart.traceColors?.[i] ?? DEFAULT_TRACE_COLORS[i] }} className='flex justify-center size-4 rounded-full cursor-pointer hover:ring focus-within:ring-2' htmlFor={`traceColors_${i}`}>
                  <input type='color' value={editedChart.traceColors?.[i] ?? DEFAULT_TRACE_COLORS[i]} onChange={(e) => { editedChart.traceColors ??= []; editedChart.traceColors[i] = e.currentTarget.value }} className='absolute opacity-0 pointer-events-none' id={`traceColors_${i}`} name={`traceColors_${i}`} />
                </label>
              </Tooltip>
            ))}

            {((editedChart.method.type === 'aggregate_avg' && editedChart.method.bars) || editedChart.method.type === 'custom') && editedChart.style !== 'pie' && editedChart.style !== 'heatmap' && (
              <Tooltip message='Bars'>
                <label style={{ backgroundColor: editedChart.barColor ?? DEFAULT_BAR_COLOR }} className='flex justify-center size-4 rounded-sm cursor-pointer hover:ring focus-within:ring-2' htmlFor='barColor'>
                  <input type='color' value={editedChart.barColor ?? DEFAULT_BAR_COLOR} onChange={(e) => { editedChart.barColor = e.currentTarget.value }} className='absolute opacity-0 pointer-events-none' id='barColor' name='barColor' />
                </label>
              </Tooltip>
            )}

            {editedChart.style === 'heatmap' && Array.from({ length: 3 }, (_, i) => (
              <Tooltip key={i} style={{ transitionDelay: `${i * 40}ms` }} message={`${['Low', 'Mid', 'High'][i]!} Color`} className='transition-all block transition-discrete opacity-100 starting:opacity-0'>
                <label style={{ backgroundColor: editedChart.traceColors?.[i] ?? DEFAULT_HEATMAP_COLORS[i] }} className={twMerge('flex justify-center size-4 cursor-pointer hover:ring focus-within:ring-2', ['rounded-l-full', 'rounded-full', 'rounded-r-full'][i])} htmlFor={`traceColors_${i}`}>
                  <input type='color' value={editedChart.traceColors?.[i] ?? DEFAULT_HEATMAP_COLORS[i]} onChange={(e) => { editedChart.traceColors ??= []; editedChart.traceColors[i] = e.currentTarget.value }} className='absolute opacity-0 pointer-events-none' id={`traceColors_${i}`} name={`traceColors_${i}`} />
                </label>
              </Tooltip>
            ))}
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
          <DebouncedInput type='number' min={1} delay={500} placeholder='No Limit' value={editedChart.limit?.toString() ?? ''} onChange={(e) => e.currentTarget.reportValidity()} onDebouncedChange={(v) => editChart('limit', v ? parseInt(v) : undefined)} className='w-full invalid:input-error' id='limit' name='limit' />
        </div>

        {editedChart.method.type !== 'custom' && (
          <Join horizontal className='w-full'>
            <div className='fieldset'>
              <label htmlFor='sortCol' className='label'>
                <span className='label-text'>Order By</span>
              </label>
              <Select disabled={!editedChart.table || editedChart.style === 'heatmap'} value={editedChart.sortCol ?? ''} onChange={(e) => editChart('sortCol', e.currentTarget.value)} className='w-full join-item' id='sortCol' name='sortCol'>
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
                <span className='label-text invisible'>Sort</span>
              </label>
              <label htmlFor='sortDesc' className='relative checkbox size-10 join-item [:has(:disabled)]:cursor-not-allowed [:has(:disabled)]:opacity-50'>
                <input type='checkbox' hidden className='absolute' disabled={!editedChart.table || !editedChart.sortCol || editedChart.style === 'heatmap'} checked={editedChart.sortDesc ?? false} onChange={(e) => editChart('sortDesc', e.currentTarget.checked || undefined)} id='sortDesc' name='sortDesc' />
                <MdArrowUpward className='transition [:has(:checked)>&]:-scale-y-100 absolute inset-0 size-full p-2' />
              </label>
            </div>
          </Join>
        )}
      </div>
    </>
  )
}
