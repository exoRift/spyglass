import { twMerge } from 'tailwind-merge'

import { IoMdEye, IoMdEyeOff } from 'react-icons/io'
import { useRef } from 'react'

export function PasswordInput ({ className, ...props }: React.ComponentProps<'input'>): React.ReactNode {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className={twMerge('input [:has(>&:invalid)]:input-error outline-offset-0', className)}>
      <input type='password' ref={inputRef} {...props} />

      <button className='group' onMouseDown={(e) => { if (e.button === 0) inputRef.current!.type = 'text' }} onPointerUp={() => { inputRef.current!.type = 'password' }}>
        <IoMdEye className='text-lg group-active:hidden' />
        <IoMdEyeOff className='text-lg hidden group-active:block' />
      </button>
    </div>
  )
}
