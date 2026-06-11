import { Children, isValidElement, useCallback, useEffect } from 'react'
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
}: Omit<React.ComponentProps<'button'>, 'value' | 'defaultValue' | 'children'> & {
  name?: string
  value?: string[]
  defaultValue?: string[]
  disabled?: boolean
  unit?: string
  onValueChange?: (v: string[]) => void
  children?: React.ReactElement<OptionProps> | Array<React.ReactElement<OptionProps>>
}): React.ReactNode {
  const checked = useSet(forcedValue ?? defaultValue)

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.button === 0) {
      e.preventDefault()
      // @ts-expect-error
      if (document.activeElement && e.currentTarget.parentElement!.contains(document.activeElement)) document.activeElement.blur()
      else e.currentTarget.focus()
    }
  }, [])

  useEffect(() => {
    if (forcedValue === undefined) return

    const set = new Set(forcedValue)
    if (set.symmetricDifference(checked).size) checked.reset(forcedValue)
  }, [checked, forcedValue])

  return (
    <Dropdown className='has-[>:disabled]:pointer-events-none!'>
      {Boolean(name) && (
        <div className='hidden'>
          {Array.from(checked).map((v) => <input type='hidden' name={name} value={v} key={v} />)}
        </div>
      )}

      <button disabled={disabled || undefined} className={twMerge('select select-none *:w-full cursor-auto outline-offset-0', className)} {...props} onMouseDown={onMouseDown}>
        {`${checked.size} ${unit}${checked.size === 1 ? '' : 's'} selected`}
      </button>

      <Dropdown.Menu className='w-full'>
        {children && Children.map(children, (child) => {
          if (!isValidElement<OptionProps>(child)) return null
          const value = child.props.value as string
          const label = child.props.children ?? ''

          return (
            <Dropdown.Item className='cursor-pointer select-none' onClick={() => { checked.toggle(value); onValueChange?.(Array.from(checked)) }}>
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
