import { useCallback, useEffect, useRef, useState } from 'react'

import { Input, Textarea } from 'react-daisyui'

/**
 * An input with a configurable debounce
 * @param props
 * @param props.Comp              The component to use
 * @param props.delay             The debounce delay in ms
 * @param props.onDebouncedChange
 * @param props.value
 * @param props.onChange
 */
export function DebouncedInput<C extends 'input' | 'textarea' | React.ComponentType<{ value: string, onChange: (e: string | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void }> = 'input'> ({
  Comp = 'input' as C,
  delay = 200,
  onDebouncedChange,
  value: forcedValue,
  onChange,
  ...props
}: {
  Comp?: C
  value?: string
  delay?: number
  onDebouncedChange?: (v: string) => void
} & Omit<React.ComponentProps<C>, 'value'>): React.ReactNode {
  const touched = useRef(false)
  const [value, setValue] = useState(forcedValue)

  const interceptedOnChange = useCallback((e: string | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange?.(e as any)
    if (typeof e === 'string' || !e.defaultPrevented) {
      touched.current = true
      setValue(typeof e === 'string' ? e : e.currentTarget.value)
    }
  }, [onChange])

  useEffect(() => {
    if (!onDebouncedChange || !touched.current) return

    const timeout = setTimeout(() => onDebouncedChange(value ?? ''), delay)

    return () => clearTimeout(timeout)
  }, [value])

  useEffect(() => setValue(forcedValue), [forcedValue])

  let DaisyComp
  switch (Comp) {
    case 'input': DaisyComp = Input; break
    case 'textarea': DaisyComp = Textarea; break
    default: DaisyComp = Comp; break
  }

  return <DaisyComp value={value as any} onChange={interceptedOnChange} {...props} />
}
