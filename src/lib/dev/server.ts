const { createServer } = await import('vite')

const server = await createServer({
  root: 'view',
  clearScreen: false
})
await server.listen()

const url = server.resolvedUrls?.local[0]

self.postMessage(url)
