import type { Config } from '../../lib/config'
import type { PromisifiedBinds } from '../../'

declare global {
  interface Window extends PromisifiedBinds {
    _invalidConfigSchemaError: string | undefined
    _missingDriver: string | undefined
    _config: Config
    _configLocation: string
    saveConfigWithGuard: PromisifiedBinds['saveConfig']
  }
}

export {}
