import path from 'path'

import { Config } from '../src/lib/config'

const schema = Config.merge({ $schema: 'string' }).toJsonSchema({
  fallback: {
    morph: (ctx) => ctx.out ?? ctx.base
  }
})

await Bun.write(path.resolve(import.meta.dirname, '../schemas/config.json'), JSON.stringify(schema, null, 2))
