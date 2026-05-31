import { useCallback, useEffect, useRef, useState } from 'react'

import { Input, Textarea } from 'react-daisyui'

export function DebouncedInput<C extends 'input' | 'textarea' = 'input'> ({
  Comp = 'input' as C,
  delay = 200,
  onDebouncedChange,
  value,
  onChange,
  ...props
}: {
  Comp?: C
  value?: string
  delay?: number
  onDebouncedChange?: (v: string) => void
} & React.ComponentProps<C>): React.ReactNode {
  const touched = useRef(false)
  const [rawValue, setRawValue] = useState(value)

  const interceptedOnChange = useCallback((e: React.ChangeEvent<HTMLElementTagNameMap[C]>) => {
    onChange?.(e as any)
    if (!e.defaultPrevented) {
      touched.current = true
      setRawValue(e.currentTarget.value)
    }
  }, [onChange])

  useEffect(() => {
    if (!onDebouncedChange || !touched.current) return

    const timeout = setTimeout(() => onDebouncedChange(rawValue ?? ''), delay)

    return () => clearTimeout(timeout)
  }, [rawValue])

  const DaisyComp = Comp === 'input'
    ? Input
    : Textarea

  return <DaisyComp value={rawValue} onChange={interceptedOnChange as any} {...props as any} />
}
