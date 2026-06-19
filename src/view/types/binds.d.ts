import type { Config } from '../../lib/config'
import type { PromisifiedBinds } from '../../'

declare global {
  interface Window extends PromisifiedBinds {
    _invalidConfigSchemaError: string | undefined
    _config: Config
    _configLocation: string
    saveConfigWithGuard: PromisifiedBinds['saveConfig']
    alertMissingDriver: ((driver: string, client?: string) => void) | undefined
  }
}

export {}
