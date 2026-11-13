import assert from "node:assert/strict"
import test from "node:test"
import { collectDroppedFiles, isAudioFile, uploadBatches } from "../src/upload-files.js"

const fileEntry = (name) => ({ isFile: true, file: (resolve) => resolve({ name, size: 100 }) })
const directory = (batches) => ({ isDirectory: true, createReader: () => { let offset = 0; return { readEntries: (resolve) => resolve(batches[offset++] || []) } } })

test("folder drops recursively read every directory page and preserve Unicode filenames", async () => {
  const entry = directory([[fileEntry("01 König.ogg"), directory([[fileEntry("02 Grüße.opus")]])], [fileEntry("Cover.jpg")]])
  const files = await collectDroppedFiles({ items: [{ kind: "file", webkitGetAsEntry: () => entry, getAsFile: () => null }] })
  assert.deepEqual(files.filter(isAudioFile).map((file) => file.name), ["01 König.ogg", "02 Grüße.opus"])
  const fallback = await collectDroppedFiles({ files: [{ name: "Löwe.mp3", size: 50 }] })
  assert.equal(fallback[0].name, "Löwe.mp3")
})

test("large folder uploads are divided by both file count and total bytes", () => {
  assert.deepEqual(uploadBatches(Array.from({ length: 105 }, (_, index) => ({ name: `${index}.ogg`, size: 100 }))).map((batch) => batch.length), [20, 20, 20, 20, 20, 5])
  assert.deepEqual(uploadBatches([{ size: 200 * 1024 ** 2 }, { size: 200 * 1024 ** 2 }]).map((batch) => batch.length), [1, 1])
})
