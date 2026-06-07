import { useCallback, useEffect, useRef, useState } from 'react'

import { Input, Textarea } from 'react-daisyui'

export function DebouncedInput<C extends 'input' | 'textarea' | React.ComponentType<{ value: string, onChange: (e: string | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void }> = 'input'> ({
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
} & Omit<React.ComponentProps<C>, 'value'>): React.ReactNode {
  const touched = useRef(false)
  const [rawValue, setRawValue] = useState(value)

  const interceptedOnChange = useCallback((e: string | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange?.(e as any)
    if (typeof e === 'string' || !e.defaultPrevented) {
      touched.current = true
      setRawValue(typeof e === 'string' ? e : e.currentTarget.value)
    }
  }, [onChange])

  useEffect(() => {
    if (!onDebouncedChange || !touched.current) return

    const timeout = setTimeout(() => onDebouncedChange(rawValue ?? ''), delay)

    return () => clearTimeout(timeout)
  }, [rawValue])

  let DaisyComp
  switch (Comp) {
    case 'input': DaisyComp = Input; break
    case 'textarea': DaisyComp = Textarea; break
    default: DaisyComp = Comp; break
  }

  return <DaisyComp value={rawValue as any} onChange={interceptedOnChange} {...props} />
}
