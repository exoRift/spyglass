import React, { Children, useEffect } from 'react'
import { twMerge } from 'tailwind-merge'

import { useSet } from 'react-exo-hooks'

import { Dropdown, Checkbox, Select } from 'react-daisyui'

type OptionProps = React.ComponentProps<typeof Select.Option>

export function Multiselect ({
  name,
  value: forcedValue,
  defaultValue,
  disabled,
  unit = 'item',
  onValueChange,
  children,
  className,
  ...props
}: Omit<React.ComponentProps<'summary'>, 'value' | 'defaultValue' | 'children'> & {
  name?: string
  value?: string[]
  defaultValue?: string[]
  disabled?: boolean
  unit?: string
  onValueChange?: (v: string[]) => void
  children?: React.ReactElement<OptionProps> | Array<React.ReactElement<OptionProps>>
}): React.ReactNode {
  const checked = useSet(forcedValue ?? defaultValue)

  useEffect(() => {
    if (forcedValue !== undefined) checked.reset(forcedValue)
  }, [checked, forcedValue])

  return (
    <Dropdown className='has-[>:disabled]:!pointer-events-none'>
      {Boolean(name) && (
        <div className='hidden'>
          {Array.from(checked).map((v) => <input type='hidden' name={name} value={v} key={v} />)}
        </div>
      )}

      {/* @ts-expect-error */}
      <button disabled={disabled || undefined} className={twMerge('select select-none *:w-full cursor-auto outline-offset-0', className)} {...props} onPointerDown={(e) => { e.preventDefault(); if (document.activeElement && e.currentTarget.parentElement!.contains(document.activeElement)) document.activeElement.blur(); else e.currentTarget.focus() }}>
        {`${checked.size} ${unit}${checked.size === 1 ? '' : 's'} selected`}
      </button>

      <Dropdown.Menu className='w-full'>
        {children && Children.map(children, (child) => {
          if (!React.isValidElement<OptionProps>(child)) return null
          const value = child.props.value as string
          const label = child.props.children ?? ''

          return (
            <Dropdown.Item onClick={() => { checked.toggle(value); onValueChange?.(Array.from(checked)) }}>
              <Checkbox readOnly size='sm' checked={checked.has(value)} />

              <span className='ml-1'>{label}</span>
            </Dropdown.Item>
          )
        })}
      </Dropdown.Menu>
    </Dropdown>
  )
}
Multiselect.Option = Select.Option
