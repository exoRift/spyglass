import { useMemo } from 'react'
import { FaSkullCrossbones } from 'react-icons/fa'

import { constructReportLink } from '../../lib/errors'

/**
 * A view to show when the UI encounters an error that puts it in an unrecoverable state
 * @param props
 * @param props.error The error
 */
export default function ErrorView ({ error }: { error: any }): React.ReactNode {
  const url = useMemo(() => constructReportLink('UI ERROR', error), [error])

  return (
    <div className='w-screen h-screen flex flex-col justify-center items-center text-center gap-8'>
      <FaSkullCrossbones className='text-3xl text-error' />
      <h1 className='text-3xl font-bold'>Spyglass has entered an unrecoverable state</h1>
      <code className='error max-w-2/3 text-start'>{error.toString()}</code>
      <a className='link' href={url} target='_blank' rel='noreferrer' onClick={(e) => { e.preventDefault(); void window.openLink(e.currentTarget.href) }}>Report Issue</a>
    </div>
  )
}
