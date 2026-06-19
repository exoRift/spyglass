import { useState } from 'react'
import { twMerge } from 'tailwind-merge'

import { Button } from 'react-daisyui'

/**
 * A file input that uses the Bun runtime methods for resolution instead of the webview
 * @param props
 * @param props.className
 * @param props.accept
 * @param props.defaultValue
 */
export function NativeFileInput ({ className, accept, defaultValue, ...props }: React.ComponentProps<'input'> & { defaultValue?: string }): React.ReactNode {
  const [value, setValue] = useState(defaultValue ?? '')

  return (
    <div className={twMerge('file-input', className)} onClick={(e) => { e.preventDefault(); void window.promptFile('Select SQLite Database', accept?.split(', ').map((f) => `*${f}`)).then((f) => setValue(f || '')) }}>
      <input type='hidden' accept={accept} value={value} {...props} />
      <Button className='-ml-1 mr-2'>Choose File</Button>
      <span className='flex justify-end overflow-hidden'>{value ? value.split('/').at(-1) : 'No file chosen'}</span>
    </div>
  )
}
