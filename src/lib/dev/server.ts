const { createServer } = await import('vite')

const server = await createServer({
  root: 'src/view',
  clearScreen: false,
  define: {
    SHIM_PORT: process.argv[2]
  }
})
await server.listen()

const url = server.resolvedUrls?.local[0]

self.postMessage(url)
