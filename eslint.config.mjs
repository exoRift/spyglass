import { config } from 'eslint-config'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  ...await config({ noJSDoc: true, useJSDoc: true }),
  reactHooks.configs['recommended-latest']
]
