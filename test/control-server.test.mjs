import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { parseFile } from "music-metadata"
import { WebSocket } from "ws"

const CONTROL_PORT = 14781
const NAVIDROME_PORT = 14533

function silentWav(durationSeconds = 1, sampleRate = 8000) {
  const sampleCount = durationSeconds * sampleRate
  const dataSize = sampleCount * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write("RIFF", 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write("WAVE", 8)
  buffer.write("fmt ", 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write("data", 36)
  buffer.writeUInt32LE(dataSize, 40)
  return buffer
}

function waitForMessage(socket, predicate = () => true, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", handleMessage)
      reject(new Error("Timed out waiting for WebSocket message"))
    }, timeoutMs)
    function handleMessage(raw) {
      const message = JSON.parse(raw.toString())
      if (!predicate(message)) return
      clearTimeout(timer)
      socket.off("message", handleMessage)
      resolve(message)
    }
    socket.on("message", handleMessage)
  })
}

function connect() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${CONTROL_PORT}/ws`)
    socket.once("open", () => resolve(socket))
    socket.once("error", reject)
  })
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${CONTROL_PORT}/health`)
      if (response.ok) return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  throw new Error("Control server did not become healthy")
}

test("pairs a controller and relays state and commands", async (context) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "tesla-control-test-"))
  const auth = { username: "karl", token: "test-token", salt: "test-salt" }
  const navidrome = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost")
    const valid =
      url.pathname === "/rest/ping.view" &&
      url.searchParams.get("u") === auth.username &&
      url.searchParams.get("t") === auth.token &&
      url.searchParams.get("s") === auth.salt
    response.writeHead(valid ? 200 : 401, { "content-type": "application/json" })
    response.end(JSON.stringify({ "subsonic-response": { status: valid ? "ok" : "failed" } }))
  })
  await new Promise((resolve) => navidrome.listen(NAVIDROME_PORT, "127.0.0.1", resolve))

  const controlServer = spawn(process.execPath, ["server/control-server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CONTROL_PORT: String(CONTROL_PORT),
      CONTROL_STATE_FILE: path.join(temporaryDirectory, "state.json"),
      NAVIDROME_URL: `http://127.0.0.1:${NAVIDROME_PORT}`,
      UPLOAD_STAGING_FOLDER: path.join(temporaryDirectory, "staging"),
      MUSIC_UPLOAD_FOLDER: path.join(temporaryDirectory, "music"),
      UPLOAD_ALLOWED_USERS: "karl",
      FFMPEG_PATH: "/usr/bin/ffmpeg",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  context.after(async () => {
    controlServer.kill("SIGTERM")
    navidrome.close()
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
  })

  await waitForHealth()

  const player = await connect()
  player.send(
    JSON.stringify({
      type: "hello",
      role: "player",
      device: { id: "player-test", secret: "player-secret", name: "Küche" },
      auth,
    }),
  )
  assert.equal((await waitForMessage(player, (message) => message.type === "authenticated")).role, "player")

  player.send(JSON.stringify({ type: "create_pairing_code" }))
  const { code } = await waitForMessage(player, (message) => message.type === "pairing_code")
  assert.match(code, /^\d{6}$/)

  const pairSocket = await connect()
  pairSocket.send(
    JSON.stringify({
      type: "hello",
      role: "pair",
      code,
      controller: { id: "controller-test", name: "Handy" },
      auth,
    }),
  )
  const paired = await waitForMessage(pairSocket, (message) => message.type === "paired")
  assert.equal(paired.pairing.playerId, "player-test")
  assert.equal(paired.pairing.playerName, "Küche")
  assert.ok(paired.pairing.token)

  const controller = await connect()
  controller.send(
    JSON.stringify({
      type: "hello",
      role: "controller",
      pairing: paired.pairing,
      auth,
    }),
  )
  const controllerReady = await waitForMessage(controller, (message) => message.type === "authenticated")
  assert.equal(controllerReady.online, true)

  const playbackState = {
    playerName: "Küche",
    currentSong: { id: "song-1", title: "Song 1", artist: "Artist" },
    queue: [{ id: "song-1", title: "Song 1", artist: "Artist" }],
    currentIndex: 0,
    isPlaying: true,
    volume: 0.6,
  }
  const statePromise = waitForMessage(controller, (message) => message.type === "state")
  player.send(JSON.stringify({ type: "state", state: playbackState }))
  const relayedState = await statePromise
  assert.deepEqual(relayedState.state, playbackState)

  const commandPromise = waitForMessage(player, (message) => message.type === "command")
  controller.send(JSON.stringify({ type: "command", command: "set_volume", payload: { volume: 0.25 } }))
  const relayedCommand = await commandPromise
  assert.equal(relayedCommand.command, "set_volume")
  assert.equal(relayedCommand.payload.volume, 0.25)

  const formData = new FormData()
  formData.append("files", new Blob([silentWav()], { type: "audio/wav" }), "Test Artist - Test Song.wav")
  const uploadHeaders = {
    "X-Navidrome-Username": auth.username,
    "X-Navidrome-Token": auth.token,
    "X-Navidrome-Salt": auth.salt,
  }
  const analyzeResponse = await fetch(`http://127.0.0.1:${CONTROL_PORT}/upload/analyze`, {
    method: "POST",
    headers: uploadHeaders,
    body: formData,
  })
  assert.equal(analyzeResponse.status, 200)
  const analyzed = await analyzeResponse.json()
  assert.equal(analyzed.files.length, 1)
  assert.equal(analyzed.files[0].metadata.artist, "Test Artist")
  assert.equal(analyzed.files[0].metadata.title, "Test Song")

  analyzed.files[0].metadata.album = "Test Album"
  analyzed.files[0].metadata.albumArtist = "Test Artist"
  analyzed.files[0].metadata.track = 1
  const importResponse = await fetch(`http://127.0.0.1:${CONTROL_PORT}/upload/import`, {
    method: "POST",
    headers: { ...uploadHeaders, "content-type": "application/json" },
    body: JSON.stringify({ files: [{ id: analyzed.files[0].id, metadata: analyzed.files[0].metadata }] }),
  })
  assert.equal(importResponse.status, 200)
  const imported = await importResponse.json()
  assert.equal(imported.results[0].status, "imported")
  const importedPath = path.join(temporaryDirectory, "music", "Test Artist", "Test Album", "01 - Test Song.wav")
  await fs.access(importedPath)
  const importedMetadata = await parseFile(importedPath)
  assert.equal(importedMetadata.common.title, "Test Song")
  assert.equal(importedMetadata.common.artist, "Test Artist")
  assert.equal(importedMetadata.common.album, "Test Album")

  const duplicateForm = new FormData()
  duplicateForm.append("files", new Blob([silentWav()], { type: "audio/wav" }), "Test Artist - Test Song.wav")
  const duplicateAnalyzeResponse = await fetch(`http://127.0.0.1:${CONTROL_PORT}/upload/analyze`, {
    method: "POST",
    headers: uploadHeaders,
    body: duplicateForm,
  })
  const duplicateAnalyzed = await duplicateAnalyzeResponse.json()
  assert.ok(duplicateAnalyzed.files[0].duplicate)
  const duplicateImportResponse = await fetch(`http://127.0.0.1:${CONTROL_PORT}/upload/import`, {
    method: "POST",
    headers: { ...uploadHeaders, "content-type": "application/json" },
    body: JSON.stringify({ files: [{ id: duplicateAnalyzed.files[0].id, metadata: analyzed.files[0].metadata }] }),
  })
  const duplicateImport = await duplicateImportResponse.json()
  assert.equal(duplicateImport.results[0].status, "duplicate")
  assert.deepEqual(
    (await fs.readdir(path.dirname(importedPath))).filter((filename) => filename.endsWith(".wav")),
    ["01 - Test Song.wav"],
  )

  player.close()
  controller.close()
})
