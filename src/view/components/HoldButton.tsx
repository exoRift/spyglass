import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from 'react-daisyui'
import { twMerge } from 'tailwind-merge'

/**
 * A button that must be held down to trigger `onHold`
 * @param props
 * @param props.time        The time in ms the button must be held
 * @param props.fill        The fill color
 * @param props.pressedFill The pressed fill color
 * @param props.onHold      The hold action callback
 * @param props.style
 * @param props.className
 * @param props.children
 * @param props.onMouseDown
 * @param props.onMouseUp
 */
export function HoldButton ({ time, fill, pressedFill, onHold, style, className, children, onMouseDown, ...props }: React.ComponentProps<typeof Button> & { time: number, pressedFill: string, fill: string, onHold: () => void }): React.ReactNode {
  const holdTime = useRef<number | null>(null)
  const releaseTime = useRef<number | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const [holding, setHolding] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [ready, setReady] = useState(false)

  const mouseDown = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const progress = releaseTime.current === null
      ? 0
      : Math.max(0, time - (Date.now() - releaseTime.current))

    holdTime.current = Date.now() - progress
    setHolding(true)
    onMouseDown?.(e)
  }, [onMouseDown, time])

  const mouseUp = useCallback((e: MouseEvent) => {
    if (holdTime.current === null) return

    const progress = Math.min(time, Date.now() - holdTime.current)

    if (progress >= time && e.target && buttonRef.current?.contains(e.target as Node)) {
      onHold()
      setPressed(true)
      releaseTime.current = null
    } else releaseTime.current = Date.now() - (time - progress)

    holdTime.current = null
    setHolding(false)
  }, [time, onHold])

  useEffect(() => {
    if (!pressed) {
      document.addEventListener('mouseup', mouseUp, { passive: true })
      return () => document.removeEventListener('mouseup', mouseUp)
    }
  }, [mouseUp, pressed])

  useEffect(() => {
    if (holding) {
      const progress = releaseTime.current === null
        ? 0
        : Math.max(0, time - (Date.now() - releaseTime.current))

      const timeout = setTimeout(() => setReady(true), time - progress)
      return () => clearTimeout(timeout)
    } else setReady(false)
  }, [holding, time])

  useEffect(() => {
    if (pressed) {
      const timeout = setTimeout(() => setPressed(false), time)
      return () => clearTimeout(timeout)
    }
  }, [pressed, time])

  return (
    <Button ref={buttonRef} data-pressed={pressed || null} className={twMerge('transition duration-500 relative before:content-[""] before:transition-all before:duration-(--duration) before:absolute before:block before:left-0 before:inset-y-0 before:bg-(--btn-fill) before:w-full before:max-w-[0%] active:before:max-w-full **:z-10', holding && '**:data-msg:visible **:not-data-msg:invisible!', pressed && 'bg-(--pressed-fill) before:hidden', ready && 'hover:scale-110', className)} {...props} onMouseDown={pressed ? undefined : mouseDown} style={{ ...style, ['--duration' as any]: `${time}ms`, ['--btn-fill' as any]: fill, ['--pressed-fill' as any]: pressedFill }}>
      <span data-msg className='absolute invisible'>Hold Me</span>
      <div className='contents'>{children}</div>
    </Button>
  )
}
