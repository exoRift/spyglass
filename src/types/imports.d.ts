declare module '*.png' {
  const contents: string
  export default contents
}

declare module 'open-file-manager-dialog' {
  export function openFileManagerDialog (dirname?: string, options?: { limit?: number, filter?: string[], terminal?: string }): Promise<{ files: string[], canceled: boolean }>
}
