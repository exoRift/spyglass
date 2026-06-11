import { useState } from 'react'
import { twMerge } from 'tailwind-merge'

import { Button } from 'react-daisyui'

export function NativeFileInput ({ className, accept, defaultValue, ...props }: React.ComponentProps<'input'> & { defaultValue?: string }): React.ReactNode {
  const [value, setValue] = useState(defaultValue ?? '')

  return (
    <div className={twMerge('file-input', className)} onClick={(e) => { e.preventDefault(); void window.promptFile(accept?.split(', ').map((ext) => ext.slice(1))).then((f) => setValue(f || '')) }}>
      <input type='hidden' accept={accept} value={value} {...props} />
      <Button className='-ml-1 mr-2'>Choose File</Button>
      <span>{value ? value.split('/').at(-1) : 'No file chosen'}</span>
    </div>
  )
}
