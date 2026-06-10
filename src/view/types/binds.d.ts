import type { Config } from '../../lib/config'
import type { Binds } from '../../'

type Promisify<T extends (...args: any[]) => any> = (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>
type PromisifiedBinds = {
  [K in keyof Binds]: Promisify<Binds[K]>
}

declare global {
  interface Window extends PromisifiedBinds {
    _invalidConfigSchemaError: string | undefined
    _config: Config
    _configLocation: string
  }
}

export {}
