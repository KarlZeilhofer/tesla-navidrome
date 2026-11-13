import crypto from "node:crypto"
import { spawn } from "node:child_process"
import { createWriteStream } from "node:fs"
import fs from "node:fs/promises"
import http from "node:http"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pipeline } from "node:stream/promises"
import Busboy from "busboy"
import { parseFile } from "music-metadata"
import { WebSocketServer, WebSocket } from "ws"
import { createRadioApi } from "./radio-api.mjs"

const HOST = process.env.CONTROL_HOST || "127.0.0.1"
const PORT = Number(process.env.CONTROL_PORT || 4781)
const STATE_FILE = process.env.CONTROL_STATE_FILE || "/var/lib/tesla-navidrome-control/state.json"
const NAVIDROME_URL = process.env.NAVIDROME_URL || "http://127.0.0.1:4533"
const ALLOWED_ORIGIN = process.env.CONTROL_ALLOWED_ORIGIN || "https://navidrome.alpenchat.at"
const UPLOAD_STAGING_FOLDER = process.env.UPLOAD_STAGING_FOLDER || "/var/lib/tesla-navidrome-control/uploads"
const UPLOAD_INDEX_FILE = path.join(path.dirname(UPLOAD_STAGING_FOLDER), "upload-index.json")
const MUSIC_UPLOAD_FOLDER = process.env.MUSIC_UPLOAD_FOLDER || "/srv/music/Uploads"
const UPLOAD_ALLOWED_USERS = new Set(
  String(process.env.UPLOAD_ALLOWED_USERS || "karl")
    .split(",")
    .map((username) => username.trim())
    .filter(Boolean),
)
const FFMPEG_PATH = process.env.FFMPEG_PATH || "/usr/bin/ffmpeg"
const AUDIO_TAG_PYTHON = process.env.AUDIO_TAG_PYTHON || "/opt/tesla-navidrome-radio-venv/bin/python"
const OGG_TAG_WRITER = fileURLToPath(new URL("./write_ogg_tags.py", import.meta.url))
const MAX_UPLOAD_FILE_BYTES = Number(process.env.MAX_UPLOAD_FILE_BYTES || 1024 * 1024 * 1024)
const MAX_UPLOAD_FILES = 100
const UPLOAD_RETENTION_MS = 24 * 60 * 60 * 1000
const PAIRING_TTL_MS = 5 * 60 * 1000
const PAIR_ATTEMPT_WINDOW_MS = 60 * 1000
const MAX_PAIR_ATTEMPTS_PER_WINDOW = 10
const MAX_PLAYERS = 50
const MAX_CONNECTIONS = 100
const MAX_MESSAGE_BYTES = 512 * 1024
const ALLOWED_COMMANDS = new Set([
  "play",
  "pause",
  "toggle",
  "next",
  "previous",
  "seek",
  "set_volume",
  "set_muted",
  "set_repeat",
  "play_index",
  "remove_queue_item",
  "move_queue_item",
  "queue_song",
  "queue_batch",
  "remove_past",
  "remove_future",
  "shuffle_queue",
  "clear_queue",
  "remove_disliked",
])
const SUPPORTED_AUDIO_EXTENSIONS = new Set([".mp3", ".flac", ".m4a", ".aac", ".ogg", ".opus", ".wav", ".wma", ".wv"])

let storedState = { version: 1, players: {} }
let persistChain = Promise.resolve()
let uploadIndex = { version: 1, files: {} }
let uploadIndexPersistChain = Promise.resolve()
let importChain = Promise.resolve()
const pairingCodes = new Map()
const playerConnections = new Map()
const controllerConnections = new Map()
const playbackStates = new Map()
const pairingAttempts = new Map()
const deletionPreviews = new Map()

function musicFilesRequest(body) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection("/run/tesla-music-files/socket")
    let data = ""
    socket.setTimeout(30_000, () => socket.destroy(new Error("Dateidienst antwortet nicht")))
    socket.on("connect", () => socket.write(JSON.stringify(body) + "\n"))
    socket.on("data", (chunk) => { data += chunk.toString() })
    socket.on("error", reject)
    socket.on("end", () => {
      try { const result = JSON.parse(data); if (result.error) reject(new Error(result.error)); else resolve(result) }
      catch (err) { reject(err) }
    })
  })
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex")
}

function secretMatches(value, expectedHash) {
  const actual = Buffer.from(hash(value), "hex")
  const expected = Buffer.from(String(expectedHash || ""), "hex")
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

function randomToken() {
  return crypto.randomBytes(32).toString("hex")
}

function cleanText(value, maxLength = 80) {
  return String(value || "").trim().slice(0, maxLength)
}

function jsonResponse(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" })
  response.end(JSON.stringify(payload))
}

function uploadAuthFromRequest(request) {
  return {
    username: request.headers["x-navidrome-username"],
    token: request.headers["x-navidrome-token"],
    salt: request.headers["x-navidrome-salt"],
  }
}

function uploadOriginAllowed(request) {
  const origin = request.headers.origin
  return !origin || origin === ALLOWED_ORIGIN
}

async function authenticateUploader(request) {
  if (!uploadOriginAllowed(request)) return null
  const username = await validateNavidromeAuth(uploadAuthFromRequest(request))
  if (!username) return null
  if (!UPLOAD_ALLOWED_USERS.has("*") && !UPLOAD_ALLOWED_USERS.has(username)) return null
  return username
}

async function uploadStorage() {
  const locations = [
    { path: MUSIC_UPLOAD_FOLDER, label: "Musikbibliothek" },
    { path: UPLOAD_STAGING_FOLDER, label: "Upload-Zwischenspeicher" },
  ]
  const volumes = await Promise.all(locations.map(async (location) => {
    const [stat, space] = await Promise.all([fs.stat(location.path), fs.statfs(location.path)])
    return {
      device: stat.dev,
      label: location.label,
      totalBytes: space.blocks * space.bsize,
      usedBytes: Math.max(0, space.blocks - space.bfree) * space.bsize,
      availableBytes: Math.max(0, space.bavail) * space.bsize,
      reservedBytes: Math.max(0, space.bfree - space.bavail) * space.bsize,
    }
  }))
  const shared = volumes[0].device === volumes[1].device
  return {
    checkedAt: new Date().toISOString(),
    volumes: (shared ? [{ ...volumes[0], label: "Serverspeicher · Musik und Uploads" }] : volumes)
      .map(({ device, ...volume }) => volume),
  }
}

function filenameMetadata(filename) {
  const basename = path.basename(filename, path.extname(filename)).replace(/[_]+/g, " ").trim()
  const withoutTrack = basename.replace(/^\s*\d{1,3}[ ._-]+/, "").trim()
  const artistTitle = /^(.+?)\s+-\s+(.+)$/.exec(withoutTrack)
  return {
    artist: artistTitle?.[1]?.trim() || "",
    title: artistTitle?.[2]?.trim() || withoutTrack || "Unbenannter Song",
  }
}

function normalizeUploadMetadata(common, filename) {
  const fallback = filenameMetadata(filename)
  return {
    title: cleanText(common.title || fallback.title, 200),
    artist: cleanText(common.artist || fallback.artist, 200),
    album: cleanText(common.album, 200),
    albumArtist: cleanText(common.albumartist || common.artist || fallback.artist, 200),
    track: Math.max(0, Number(common.track?.no || 0)),
    disc: Math.max(0, Number(common.disk?.no || 0)),
    year: Math.max(0, Number(common.year || 0)),
    genre: cleanText(common.genre?.[0], 100),
  }
}

async function sha256File(filePath) {
  const handle = await fs.open(filePath, "r")
  const digest = crypto.createHash("sha256")
  try {
    for await (const chunk of handle.createReadStream({ autoClose: false })) digest.update(chunk)
  } finally {
    await handle.close()
  }
  return digest.digest("hex")
}

async function analyzeUploadedFile({ filePath, uploadId, username, originalName, extension }) {
  const parsed = await parseFile(filePath, { duration: true, skipCovers: false })
  const fileStat = await fs.stat(filePath)
  const metadata = normalizeUploadMetadata(parsed.common || {}, originalName)
  const manifest = {
    version: 1,
    id: uploadId,
    username,
    originalName,
    extension,
    size: fileStat.size,
    sha256: await sha256File(filePath),
    stagedPath: filePath,
    metadata,
    createdAt: Date.now(),
  }
  await fs.writeFile(path.join(path.dirname(filePath), "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 })
  let duplicate = uploadIndex.files[manifest.sha256] || null
  if (duplicate) {
    try { await fs.access(path.join(MUSIC_UPLOAD_FOLDER, duplicate.path)) }
    catch { duplicate = null }
  }
  return {
    id: uploadId,
    originalName,
    size: fileStat.size,
    metadata,
    fingerprint: manifest.sha256,
    duplicate,
    embeddedCover: Boolean(parsed.common?.picture?.length),
    audio: {
      container: cleanText(parsed.format?.container, 40),
      codec: cleanText(parsed.format?.codec, 80),
      duration: Number(parsed.format?.duration || 0),
      bitrate: Number(parsed.format?.bitrate || 0),
      lossless: Boolean(parsed.format?.lossless),
    },
  }
}

async function handleAnalyzeUpload(request, response, username) {
  let busboy
  try {
    busboy = Busboy({
      headers: request.headers,
      defParamCharset: "utf8",
      limits: { files: MAX_UPLOAD_FILES, fileSize: MAX_UPLOAD_FILE_BYTES, fields: 20 },
    })
  } catch (parseError) {
    return jsonResponse(response, 400, { error: parseError.message })
  }

  const fileTasks = []
  const errors = []
  busboy.on("file", (fieldName, file, info) => {
    if (fieldName !== "files") {
      file.resume()
      return
    }
    const originalName = path.basename(info.filename || "upload")
    const extension = path.extname(originalName).toLowerCase()
    if (!SUPPORTED_AUDIO_EXTENSIONS.has(extension)) {
      errors.push(`${originalName}: Dateityp wird nicht unterstützt.`)
      file.resume()
      return
    }

    const uploadId = crypto.randomUUID()
    const uploadFolder = path.join(UPLOAD_STAGING_FOLDER, uploadId)
    const filePath = path.join(uploadFolder, `audio${extension}`)
    let fileTooLarge = false
    file.on("limit", () => {
      fileTooLarge = true
    })
    fileTasks.push(
      (async () => {
        await fs.mkdir(uploadFolder, { recursive: true, mode: 0o700 })
        await pipeline(file, createWriteStream(filePath, { mode: 0o600 }))
        if (fileTooLarge) throw new Error(`Datei ist größer als ${Math.round(MAX_UPLOAD_FILE_BYTES / 1024 / 1024)} MB.`)
        return analyzeUploadedFile({ filePath, uploadId, username, originalName, extension })
      })().catch(async (uploadError) => {
        errors.push(`${originalName}: ${uploadError.message}`)
        await fs.rm(uploadFolder, { recursive: true, force: true })
        return null
      }),
    )
  })

  const parsed = new Promise((resolve, reject) => {
    busboy.on("close", resolve)
    busboy.on("error", reject)
    request.on("aborted", () => reject(new Error("Upload wurde abgebrochen.")))
  })
  request.pipe(busboy)
  try {
    await parsed
    const files = (await Promise.all(fileTasks)).filter(Boolean)
    // Search the existing library as well: same title/artist is a warning,
    // while original-file hashes are used for exact upload duplicates.
    for (const file of files) {
      if (file.duplicate || !file.metadata.artist) continue
      try {
        const auth = uploadAuthFromRequest(request)
        const url = new URL("/rest/search3.view", NAVIDROME_URL)
        url.search = new URLSearchParams({ u: username, t: auth.token, s: auth.salt, v: "1.16.1", c: "TeslaNavidromeUpload", f: "json", query: `${file.metadata.artist} ${file.metadata.title}`, songCount: "20", artistCount: "0", albumCount: "0" }).toString()
        const result = await (await fetch(url, { signal: AbortSignal.timeout(5000) })).json()
        const normalized = (value) => String(value || "").normalize("NFKC").trim().toLocaleLowerCase()
        file.possibleDuplicate = (result["subsonic-response"]?.searchResult3?.song || []).some((song) => normalized(song.title) === normalized(file.metadata.title) && normalized(song.artist) === normalized(file.metadata.artist))
      } catch { /* Exact-file duplicate checks still apply if search is unavailable. */ }
    }
    return jsonResponse(response, files.length ? 200 : 400, { files, errors })
  } catch (uploadError) {
    return jsonResponse(response, 400, { error: uploadError.message, errors })
  }
}

async function readJsonBody(request, maxBytes = 2 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBytes) throw new Error("Anfrage ist zu groß.")
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
}

function safePathSegment(value, fallback) {
  const cleaned = cleanText(value || fallback, 160)
    .normalize("NFKC")
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .trim()
  return cleaned || fallback
}

function normalizeConfirmedMetadata(metadata, fallback) {
  return {
    title: cleanText(metadata?.title || fallback.title || "Unbenannter Song", 200),
    artist: cleanText(metadata?.artist || fallback.artist || "Unbekannter Künstler", 200),
    album: cleanText(metadata?.album || fallback.album || "Unbekanntes Album", 200),
    albumArtist: cleanText(metadata?.albumArtist || metadata?.artist || fallback.albumArtist || fallback.artist, 200),
    track: Math.max(0, Math.min(999, Number(metadata?.track || 0))),
    disc: Math.max(0, Math.min(99, Number(metadata?.disc || 0))),
    year: Math.max(0, Math.min(9999, Number(metadata?.year || 0))),
    genre: cleanText(metadata?.genre, 100),
  }
}

function runFfmpeg(inputPath, outputPath, metadata) {
  const metadataArgs = [
    ["title", metadata.title],
    ["artist", metadata.artist],
    ["album", metadata.album],
    ["album_artist", metadata.albumArtist],
    ["track", metadata.track || ""],
    ["disc", metadata.disc || ""],
    ["date", metadata.year || ""],
    ["genre", metadata.genre],
  ].flatMap(([key, value]) => ["-metadata", `${key}=${value}`])
  const args = ["-nostdin", "-v", "error", "-y", "-i", inputPath, "-map", "0", "-c", "copy", "-map_metadata", "0", ...metadataArgs, outputPath]
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, args, { stdio: ["ignore", "ignore", "pipe"] })
    let stderr = ""
    const timeout = setTimeout(() => child.kill("SIGKILL"), 5 * 60 * 1000)
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 16_000) stderr += chunk.toString()
    })
    child.on("error", reject)
    child.on("close", (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `ffmpeg wurde mit Status ${code} beendet.`))
    })
  })
}

async function availableDestination(basePath) {
  const extension = path.extname(basePath)
  const stem = basePath.slice(0, -extension.length)
  for (let suffix = 1; suffix <= 999; suffix += 1) {
    const candidate = suffix === 1 ? basePath : `${stem} (${suffix})${extension}`
    try {
      await fs.access(candidate)
    } catch (accessError) {
      if (accessError.code === "ENOENT") return candidate
      throw accessError
    }
  }
  throw new Error("Kein freier Dateiname gefunden.")
}

function writeAudioMetadata(inputPath, outputPath, metadata, extension) {
  if (![".ogg", ".opus"].includes(extension)) return runFfmpeg(inputPath, outputPath, metadata)
  return new Promise((resolve, reject) => {
    const child = spawn(AUDIO_TAG_PYTHON, [OGG_TAG_WRITER, inputPath, outputPath], { stdio: ["pipe", "ignore", "pipe"] })
    let stderr = ""
    const timeout = setTimeout(() => child.kill("SIGKILL"), 5 * 60 * 1000)
    child.stderr.on("data", (chunk) => { if (stderr.length < 16_000) stderr += chunk.toString() })
    child.stdin.on("error", () => {})
    child.stdin.end(JSON.stringify(metadata))
    child.on("error", (error) => { clearTimeout(timeout); reject(error) })
    child.on("close", (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || "Ogg-Metadaten konnten nicht gespeichert werden."))
    })
  })
}

async function importUploadedFile(item, username) {
  const uploadId = cleanText(item?.id, 80)
  if (!/^[0-9a-f-]{36}$/i.test(uploadId)) throw new Error("Ungültige Upload-ID.")
  const uploadFolder = path.join(UPLOAD_STAGING_FOLDER, uploadId)
  const manifest = JSON.parse(await fs.readFile(path.join(uploadFolder, "manifest.json"), "utf8"))
  if (manifest.username !== username || manifest.id !== uploadId) throw new Error("Upload gehört zu einem anderen Benutzer.")
  const metadata = normalizeConfirmedMetadata(item.metadata, manifest.metadata)
  const indexedUpload = uploadIndex.files[manifest.sha256]
  if (indexedUpload?.path) {
    const indexedPath = path.resolve(MUSIC_UPLOAD_FOLDER, indexedUpload.path)
    const uploadRoot = `${path.resolve(MUSIC_UPLOAD_FOLDER)}${path.sep}`
    if (indexedPath.startsWith(uploadRoot)) {
      try {
        await fs.access(indexedPath)
        await fs.rm(uploadFolder, { recursive: true, force: true })
        return { id: uploadId, status: "duplicate", path: path.relative(path.dirname(MUSIC_UPLOAD_FOLDER), indexedPath) }
      } catch (accessError) {
        if (accessError.code !== "ENOENT") throw accessError
      }
    }
    delete uploadIndex.files[manifest.sha256]
  }
  const artistFolder = safePathSegment(metadata.albumArtist || metadata.artist, "Unbekannter Künstler")
  const albumFolder = safePathSegment(metadata.album, "Unbekanntes Album")
  const trackPrefix = metadata.track > 0 ? `${String(metadata.track).padStart(2, "0")} - ` : ""
  const filename = `${trackPrefix}${safePathSegment(metadata.title, "Unbenannter Song")}${manifest.extension}`
  const destinationFolder = path.join(MUSIC_UPLOAD_FOLDER, artistFolder, albumFolder)
  await fs.mkdir(destinationFolder, { recursive: true, mode: 0o755 })
  const destination = await availableDestination(path.join(destinationFolder, filename))

  const temporaryPath = path.join(destinationFolder, `.uploading-${crypto.randomUUID()}${manifest.extension}`)
  try {
    await writeAudioMetadata(manifest.stagedPath, temporaryPath, metadata, manifest.extension)
    await fs.chmod(temporaryPath, 0o644)
    await fs.rename(temporaryPath, destination)
    uploadIndex.files[manifest.sha256] = {
      path: path.relative(MUSIC_UPLOAD_FOLDER, destination),
      importedAt: Date.now(),
    }
    await persistUploadIndex()
    await fs.rm(uploadFolder, { recursive: true, force: true })
    return { id: uploadId, status: "imported", path: path.relative(path.dirname(MUSIC_UPLOAD_FOLDER), destination) }
  } catch (importError) {
    await fs.rm(temporaryPath, { force: true })
    throw importError
  }
}

function queueImport(item, username) {
  const operation = importChain.then(() => importUploadedFile(item, username))
  importChain = operation.catch(() => {})
  return operation
}

async function handleImportUpload(request, response, username) {
  try {
    const body = await readJsonBody(request)
    if (!Array.isArray(body.files) || body.files.length === 0 || body.files.length > MAX_UPLOAD_FILES) {
      return jsonResponse(response, 400, { error: "Keine gültige Dateiliste übermittelt." })
    }
    const results = []
    for (const item of body.files) {
      try {
        results.push(await queueImport(item, username))
      } catch (importError) {
        results.push({ id: item?.id, status: "error", error: importError.message })
      }
    }
    return jsonResponse(response, results.some((result) => result.status === "error") ? 207 : 200, { results })
  } catch (importError) {
    return jsonResponse(response, 400, { error: importError.message })
  }
}

async function cleanupExpiredUploads() {
  try {
    const entries = await fs.readdir(UPLOAD_STAGING_FOLDER, { withFileTypes: true })
    const now = Date.now()
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const uploadFolder = path.join(UPLOAD_STAGING_FOLDER, entry.name)
          const fileStat = await fs.stat(uploadFolder)
          if (now - fileStat.mtimeMs > UPLOAD_RETENTION_MS) await fs.rm(uploadFolder, { recursive: true, force: true })
        }),
    )
  } catch (cleanupError) {
    if (cleanupError.code !== "ENOENT") console.error("Could not clean upload staging", cleanupError)
  }
}

function send(socket, message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

function error(socket, message, code = "invalid_request") {
  send(socket, { type: "error", code, message })
}

function controllersFor(playerId) {
  const controllers = storedState.players[playerId]?.controllers || {}
  return Object.entries(controllers).map(([id, controller]) => ({
    id,
    name: controller.name,
    username: controller.username,
    createdAt: controller.createdAt,
  }))
}

function broadcastControllers(playerId) {
  send(playerConnections.get(playerId), {
    type: "controllers",
    controllers: controllersFor(playerId),
  })
}

function broadcastToControllers(playerId, message) {
  for (const socket of controllerConnections.get(playerId) || []) send(socket, message)
}

function setPlayerOnline(playerId, online) {
  broadcastToControllers(playerId, { type: "player_status", online })
}

async function loadState() {
  try {
    const parsed = JSON.parse(await fs.readFile(STATE_FILE, "utf8"))
    if (parsed?.version === 1 && parsed.players && typeof parsed.players === "object") storedState = parsed
  } catch (loadError) {
    if (loadError.code !== "ENOENT") console.error("Could not load control state", loadError)
  }
}

function persistState() {
  const snapshot = JSON.stringify(storedState, null, 2)
  persistChain = persistChain
    .then(async () => {
      await fs.mkdir(path.dirname(STATE_FILE), { recursive: true, mode: 0o700 })
      const temporaryFile = `${STATE_FILE}.${process.pid}.tmp`
      await fs.writeFile(temporaryFile, snapshot, { mode: 0o600 })
      await fs.rename(temporaryFile, STATE_FILE)
    })
    .catch((persistError) => console.error("Could not persist control state", persistError))
  return persistChain
}

async function loadUploadIndex() {
  try {
    const parsed = JSON.parse(await fs.readFile(UPLOAD_INDEX_FILE, "utf8"))
    if (parsed?.version === 1 && parsed.files && typeof parsed.files === "object") uploadIndex = parsed
  } catch (loadError) {
    if (loadError.code !== "ENOENT") console.error("Could not load upload index", loadError)
  }
}

function persistUploadIndex() {
  const snapshot = JSON.stringify(uploadIndex, null, 2)
  uploadIndexPersistChain = uploadIndexPersistChain
    .then(async () => {
      const temporaryFile = `${UPLOAD_INDEX_FILE}.${process.pid}.tmp`
      await fs.writeFile(temporaryFile, snapshot, { mode: 0o600 })
      await fs.rename(temporaryFile, UPLOAD_INDEX_FILE)
    })
    .catch((persistError) => console.error("Could not persist upload index", persistError))
  return uploadIndexPersistChain
}

async function validateNavidromeAuth(auth) {
  const username = cleanText(auth?.username, 100)
  const token = cleanText(auth?.token, 256)
  const salt = cleanText(auth?.salt, 256)
  if (!username || !token || !salt) return null

  const url = new URL("/rest/ping.view", NAVIDROME_URL)
  url.search = new URLSearchParams({
    u: username,
    t: token,
    s: salt,
    v: "1.16.1",
    c: "TeslaNavidromeControl",
    f: "json",
  }).toString()

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    const json = await response.json()
    if (response.ok && json?.["subsonic-response"]?.status === "ok") return username
  } catch {
    // Authentication failures and unavailable Navidrome are handled alike.
  }
  return null
}

function uniquePairingCode() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0")
    if (!pairingCodes.has(code)) return code
  }
  throw new Error("Could not allocate pairing code")
}

function prunePairingCodes() {
  const now = Date.now()
  for (const [code, pairing] of pairingCodes) {
    if (pairing.expiresAt <= now) pairingCodes.delete(code)
  }
}

function allowPairAttempt(remoteAddress) {
  const key = cleanText(remoteAddress || "unknown", 120)
  const now = Date.now()
  const current = pairingAttempts.get(key)
  if (!current || current.resetAt <= now) {
    pairingAttempts.set(key, { count: 1, resetAt: now + PAIR_ATTEMPT_WINDOW_MS })
    return true
  }
  current.count += 1
  return current.count <= MAX_PAIR_ATTEMPTS_PER_WINDOW
}

async function authenticatePlayer(socket, message, username) {
  const id = cleanText(message.device?.id, 120)
  const secret = cleanText(message.device?.secret, 256)
  const name = cleanText(message.device?.name || "Player", 80)
  if (!id || !secret) return error(socket, "Ungültige Player-Identität")

  let player = storedState.players[id]
  if (!player) {
    if (Object.keys(storedState.players).length >= MAX_PLAYERS) return error(socket, "Zu viele registrierte Player")
    player = {
      name,
      secretHash: hash(secret),
      createdBy: username,
      createdAt: Date.now(),
      controllers: {},
    }
    storedState.players[id] = player
    await persistState()
  } else if (!secretMatches(secret, player.secretHash)) {
    return error(socket, "Player-Schlüssel ungültig", "forbidden")
  }

  player.name = name
  player.lastUsername = username
  player.lastSeenAt = Date.now()
  socket.session = { role: "player", playerId: id, username }
  const previous = playerConnections.get(id)
  if (previous && previous !== socket) previous.close(4001, "Player reconnected")
  playerConnections.set(id, socket)
  send(socket, { type: "authenticated", role: "player", playerId: id, name })
  broadcastControllers(id)
  setPlayerOnline(id, true)
  await persistState()
}

async function authenticateController(socket, message, username) {
  const playerId = cleanText(message.pairing?.playerId, 120)
  const controllerId = cleanText(message.pairing?.controllerId, 120)
  const token = cleanText(message.pairing?.token, 256)
  const player = storedState.players[playerId]
  const controller = player?.controllers?.[controllerId]
  if (!player || !controller || !secretMatches(token, controller.tokenHash)) {
    return error(socket, "Kopplung ungültig oder widerrufen", "forbidden")
  }

  socket.session = { role: "controller", playerId, controllerId, username }
  if (!controllerConnections.has(playerId)) controllerConnections.set(playerId, new Set())
  controllerConnections.get(playerId).add(socket)
  send(socket, {
    type: "authenticated",
    role: "controller",
    playerId,
    playerName: player.name,
    online: playerConnections.has(playerId),
  })
  const state = playbackStates.get(playerId)
  if (state) send(socket, { type: "state", state })
}

async function pairController(socket, message, username) {
  if (!allowPairAttempt(socket.remoteAddress)) return error(socket, "Zu viele Kopplungsversuche. Bitte kurz warten.")
  prunePairingCodes()
  const code = cleanText(message.code, 6)
  const pending = pairingCodes.get(code)
  if (!pending || pending.expiresAt <= Date.now()) return error(socket, "Kopplungscode ungültig oder abgelaufen")

  const controllerId = cleanText(message.controller?.id, 120)
  const controllerName = cleanText(message.controller?.name || username, 80)
  if (!controllerId) return error(socket, "Ungültige Controller-Identität")
  const player = storedState.players[pending.playerId]
  if (!player) return error(socket, "Player nicht mehr verfügbar")

  const token = randomToken()
  player.controllers ||= {}
  player.controllers[controllerId] = {
    name: controllerName,
    username,
    tokenHash: hash(token),
    createdAt: Date.now(),
  }
  pairingCodes.delete(code)
  await persistState()
  send(socket, {
    type: "paired",
    pairing: {
      playerId: pending.playerId,
      playerName: player.name,
      controllerId,
      token,
    },
  })
  broadcastControllers(pending.playerId)
  socket.close(1000, "Pairing complete")
}

async function handleHello(socket, message) {
  if (socket.session) return error(socket, "Verbindung bereits authentifiziert")
  const username = await validateNavidromeAuth(message.auth)
  if (!username) return error(socket, "Navidrome-Anmeldung ungültig", "unauthorized")

  if (message.role === "player") return authenticatePlayer(socket, message, username)
  if (message.role === "controller") return authenticateController(socket, message, username)
  if (message.role === "pair") return pairController(socket, message, username)
  return error(socket, "Unbekannte Verbindungsrolle")
}

async function handlePlayerMessage(socket, message) {
  const { playerId } = socket.session
  if (message.type === "create_pairing_code") {
    prunePairingCodes()
    for (const [code, pairing] of pairingCodes) {
      if (pairing.playerId === playerId) pairingCodes.delete(code)
    }
    const code = uniquePairingCode()
    const expiresAt = Date.now() + PAIRING_TTL_MS
    pairingCodes.set(code, { playerId, expiresAt })
    send(socket, { type: "pairing_code", code, expiresAt })
    return
  }

  if (message.type === "state") {
    const state = message.state && typeof message.state === "object" ? message.state : {}
    playbackStates.set(playerId, state)
    broadcastToControllers(playerId, { type: "state", state })
    return
  }

  if (message.type === "position") {
    broadcastToControllers(playerId, {
      type: "position",
      current: Number(message.current || 0),
      duration: Number(message.duration || 0),
      isPlaying: Boolean(message.isPlaying),
      currentIndex: Number(message.currentIndex ?? -1),
    })
    return
  }

  if (message.type === "revoke_controller") {
    const controllerId = cleanText(message.controllerId, 120)
    const player = storedState.players[playerId]
    if (!player?.controllers?.[controllerId]) return
    delete player.controllers[controllerId]
    for (const controllerSocket of controllerConnections.get(playerId) || []) {
      if (controllerSocket.session?.controllerId === controllerId) controllerSocket.close(4003, "Pairing revoked")
    }
    await persistState()
    broadcastControllers(playerId)
  }
}

function handleControllerMessage(socket, message) {
  const { playerId } = socket.session
  if (message.type === "get_state") {
    const state = playbackStates.get(playerId)
    if (state) send(socket, { type: "state", state })
    send(playerConnections.get(playerId), { type: "state_requested" })
    return
  }
  if (message.type !== "command" || !ALLOWED_COMMANDS.has(message.command)) return
  send(playerConnections.get(playerId), {
    type: "command",
    command: message.command,
    payload: message.payload && typeof message.payload === "object" ? message.payload : {},
    controller: {
      id: socket.session.controllerId,
      username: socket.session.username,
    },
  })
}

await loadState()
await fs.mkdir(UPLOAD_STAGING_FOLDER, { recursive: true, mode: 0o700 })
await fs.mkdir(MUSIC_UPLOAD_FOLDER, { recursive: true, mode: 0o755 })
await loadUploadIndex()
await cleanupExpiredUploads()

const handleRadio = createRadioApi({
  navidromeUrl: NAVIDROME_URL,
  radioUrl: process.env.RADIO_URL || "http://127.0.0.1:4782",
  validateAuth: validateNavidromeAuth,
  allowedAdmins: UPLOAD_ALLOWED_USERS,
})

const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname
    if (request.method === "GET" && pathname === "/health") {
      return jsonResponse(response, 200, { ok: true, playersOnline: playerConnections.size })
    }
    if (request.method === "POST" && pathname.startsWith("/radio/")) {
      if (!uploadOriginAllowed(request)) return jsonResponse(response, 403, { error: "Nicht erlaubt" })
      try {
        const result = await handleRadio(pathname, uploadAuthFromRequest(request), await readJsonBody(request))
        return jsonResponse(response, result.status, result.data)
      } catch {
        return jsonResponse(response, 503, { error: "Smart Radio ist gerade nicht verfügbar. Bitte später erneut versuchen." })
      }
    }
    if (pathname.startsWith("/library/") && request.method === "POST") {
      const username = await authenticateUploader(request)
      if (!username) return jsonResponse(response, 403, { error: "Keine Berechtigung" })
      const body = await readJsonBody(request)
      storedState.duplicateMarks ||= {}
      storedState.duplicateMarks[username] ||= []
      if (pathname === "/library/marks") return jsonResponse(response, 200, { songs: storedState.duplicateMarks[username] })
      if (pathname === "/library/mark") {
        const song = body.song
        if (!song?.id) return jsonResponse(response, 400, { error: "Song fehlt" })
        const marks = storedState.duplicateMarks[username].filter((item) => item.id !== song.id)
        if (!body.remove) marks.push({ id: cleanText(song.id, 120), title: cleanText(song.title, 200), artist: cleanText(song.artist, 200) })
        storedState.duplicateMarks[username] = marks
        await persistState()
        return jsonResponse(response, 200, { songs: marks })
      }
      if (pathname === "/library/delete-preview") {
        const result = await musicFilesRequest({ ids: body.ids })
        const token = randomToken()
        deletionPreviews.set(token, { username, files: result.files, expires: Date.now() + 300_000 })
        return jsonResponse(response, 200, { ...result, token })
      }
      if (pathname === "/library/delete") {
        const preview = deletionPreviews.get(body.token)
        if (!preview || preview.username !== username || preview.expires < Date.now()) return jsonResponse(response, 400, { error: "Bitte Löschung erneut prüfen" })
        deletionPreviews.delete(body.token)
        const result = await musicFilesRequest({ delete: true, ids: preview.files.map((song) => song.id), expected: preview.files })
        for (const socket of playerConnections.values()) send(socket, { type: "library_removed", ids: result.removed })
        for (const user of Object.keys(storedState.duplicateMarks)) storedState.duplicateMarks[user] = storedState.duplicateMarks[user].filter((song) => !result.removed.includes(song.id))
        await persistState()
        return jsonResponse(response, 200, result)
      }
    }
    if (request.method === "POST" && pathname.startsWith("/upload/")) {
      const username = await authenticateUploader(request)
      if (!username) {
        request.resume()
        return jsonResponse(response, 403, { error: "Upload ist für diesen Benutzer nicht freigegeben." })
      }
      if (pathname === "/upload/storage") {
        request.resume()
        return jsonResponse(response, 200, await uploadStorage())
      }
      if (pathname === "/upload/analyze") return handleAnalyzeUpload(request, response, username)
      if (pathname === "/upload/import") return handleImportUpload(request, response, username)
      if (pathname === "/upload/remove") {
        const body = await readJsonBody(request)
        const id = cleanText(body.id, 80)
        if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonResponse(response, 400, { error: "Ungültige Upload-ID" })
        const folder = path.join(UPLOAD_STAGING_FOLDER, id)
        const manifest = JSON.parse(await fs.readFile(path.join(folder, "manifest.json"), "utf8"))
        if (manifest.username !== username) return jsonResponse(response, 403, { error: "Nicht erlaubt" })
        await fs.rm(folder, { recursive: true, force: true })
        return jsonResponse(response, 200, { ok: true })
      }
    }
    return jsonResponse(response, 404, { error: "Not found" })
  } catch (requestError) {
    console.error("HTTP request failed", requestError)
    return jsonResponse(response, 500, { error: "Interner Uploadfehler." })
  }
})

const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })

server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url, "http://localhost").pathname
  const origin = request.headers.origin
  if (
    pathname !== "/ws" ||
    webSocketServer.clients.size >= MAX_CONNECTIONS ||
    (origin && origin !== ALLOWED_ORIGIN)
  ) {
    socket.destroy()
    return
  }
  webSocketServer.handleUpgrade(request, socket, head, (webSocket) =>
    webSocketServer.emit("connection", webSocket, request),
  )
})

webSocketServer.on("connection", (socket, request) => {
  socket.remoteAddress = request.socket.remoteAddress
  socket.isAlive = true
  socket.authTimer = setTimeout(() => {
    if (!socket.session) socket.close(4000, "Authentication timeout")
  }, 10_000)

  socket.on("pong", () => {
    socket.isAlive = true
  })

  socket.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString())
      if (!socket.session) {
        if (message.type !== "hello") return error(socket, "Authentifizierung erforderlich")
        await handleHello(socket, message)
        if (socket.session) clearTimeout(socket.authTimer)
        return
      }
      if (socket.session.role === "player") await handlePlayerMessage(socket, message)
      if (socket.session.role === "controller") handleControllerMessage(socket, message)
    } catch (messageError) {
      console.error("Control message failed", messageError)
      error(socket, "Nachricht konnte nicht verarbeitet werden")
    }
  })

  socket.on("close", () => {
    clearTimeout(socket.authTimer)
    const session = socket.session
    if (!session) return
    if (session.role === "player" && playerConnections.get(session.playerId) === socket) {
      playerConnections.delete(session.playerId)
      setPlayerOnline(session.playerId, false)
    }
    if (session.role === "controller") {
      const connections = controllerConnections.get(session.playerId)
      connections?.delete(socket)
      if (!connections?.size) controllerConnections.delete(session.playerId)
    }
  })
})

const heartbeat = setInterval(() => {
  prunePairingCodes()
  for (const socket of webSocketServer.clients) {
    if (!socket.isAlive) {
      socket.terminate()
      continue
    }
    socket.isAlive = false
    socket.ping()
  }
}, 30_000)
const uploadCleanup = setInterval(cleanupExpiredUploads, 60 * 60 * 1000)

webSocketServer.on("close", () => {
  clearInterval(heartbeat)
  clearInterval(uploadCleanup)
})
server.listen(PORT, HOST, () => console.log(`Tesla Navidrome control listening on ${HOST}:${PORT}`))

function shutdown() {
  for (const socket of webSocketServer.clients) socket.close(1001, "Server restarting")
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5000).unref()
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
