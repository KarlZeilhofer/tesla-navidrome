export const isAudioFile = (file) => /\.(mp3|flac|m4a|aac|ogg|opus|wav|wma|wv)$/i.test(file.name)

// Capture entries before the browser clears the drop event's data store.
export async function collectDroppedFiles(transfer) {
  const entries = [...(transfer.items || [])]
    .filter((item) => item.kind === "file")
    .map((item) => ({ entry: item.webkitGetAsEntry?.(), file: item.getAsFile?.() }))
  if (!entries.length) return [...(transfer.files || [])]
  async function read(entry) {
    if (!entry) return []
    if (entry.isFile) return [await new Promise((resolve, reject) => entry.file(resolve, reject))]
    if (!entry.isDirectory) return []
    const reader = entry.createReader()
    const files = []
    // Chromium can return directory entries in several batches.
    while (true) {
      const children = await new Promise((resolve, reject) => reader.readEntries(resolve, reject))
      if (!children.length) break
      for (const child of children) files.push(...await read(child))
    }
    return files
  }
  const files = []
  for (const { entry, file } of entries) {
    if (entry) files.push(...await read(entry))
    else if (file) files.push(file)
  }
  return files
}

export function uploadBatches(files) {
  const batches = []
  let batch = [], bytes = 0
  for (const file of files) {
    if (batch.length && (batch.length >= 20 || bytes + file.size > 256 * 1024 * 1024)) {
      batches.push(batch)
      batch = []
      bytes = 0
    }
    batch.push(file)
    bytes += file.size
  }
  if (batch.length) batches.push(batch)
  return batches
}
