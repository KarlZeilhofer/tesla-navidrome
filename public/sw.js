const STATIC_CACHE_PREFIX = "tesla-navidrome-static-"
const STATIC_CACHE_NAME = `${STATIC_CACHE_PREFIX}2026-11-14-2`
const AUDIO_CACHE_NAME = "tesla-navidrome-audio-v1"
const AUDIO_META_CACHE_NAME = "tesla-navidrome-audio-meta-v1"
const AUDIO_META_KEY = "/tesla/__offline_audio_metadata__"
const MAX_AUDIO_CACHE_BYTES = 1_000_000_000
const APP_SHELL_URL = "/tesla/"
const ICONS = [
  "/tesla/icons/icon-192.png",
  "/tesla/icons/icon-512.png",
  "/tesla/icons/icon-maskable-512.png",
]

async function cacheAppShell() {
  const cache = await caches.open(STATIC_CACHE_NAME)
  const page = await fetch(APP_SHELL_URL, { cache: "reload" })
  if (!page.ok) throw new Error(`App shell returned ${page.status}`)
  const html = await page.clone().text()
  const assetUrls = [...html.matchAll(/(?:src|href)="(\/tesla\/assets\/[^"?]+)"/g)].map((match) => match[1])
  await cache.put(APP_SHELL_URL, page)
  await cache.addAll([...new Set([...ICONS, ...assetUrls])])
}

async function readAudioMetadata() {
  const cache = await caches.open(AUDIO_META_CACHE_NAME)
  const response = await cache.match(AUDIO_META_KEY)
  if (!response) return {}
  try {
    return await response.json()
  } catch {
    return {}
  }
}

async function writeAudioMetadata(metadata) {
  const cache = await caches.open(AUDIO_META_CACHE_NAME)
  await cache.put(
    AUDIO_META_KEY,
    new Response(JSON.stringify(metadata), {
      headers: { "content-type": "application/json" },
    }),
  )
}

function audioCacheKey(url) {
  const songId = url.searchParams.get("id")
  return songId ? new Request(`/tesla/__offline_audio__/${encodeURIComponent(songId)}`) : null
}

async function touchAudioEntry(key) {
  const metadata = await readAudioMetadata()
  if (!metadata[key.url]) return
  metadata[key.url].lastAccess = Date.now()
  await writeAudioMetadata(metadata)
}

async function enforceAudioCacheLimit(metadata, protectedUrl) {
  const audioCache = await caches.open(AUDIO_CACHE_NAME)
  let totalSize = Object.values(metadata).reduce((sum, entry) => sum + Number(entry.size || 0), 0)
  const oldestFirst = Object.entries(metadata).sort(
    ([, first], [, second]) => Number(first.lastAccess || 0) - Number(second.lastAccess || 0),
  )

  for (const [url, entry] of oldestFirst) {
    if (totalSize <= MAX_AUDIO_CACHE_BYTES) break
    if (url === protectedUrl) continue
    await audioCache.delete(url)
    totalSize -= Number(entry.size || 0)
    delete metadata[url]
  }
  return metadata
}

async function storeAudioResponse(key, response) {
  if (!response.ok || response.status !== 200) return
  const audioCache = await caches.open(AUDIO_CACHE_NAME)
  await audioCache.put(key, response.clone())
  const stored = await audioCache.match(key)
  const headerSize = Number(stored?.headers.get("content-length") || 0)
  const size = headerSize > 0 ? headerSize : (await stored.blob()).size
  let metadata = await readAudioMetadata()
  metadata[key.url] = { size, lastAccess: Date.now() }
  metadata = await enforceAudioCacheLimit(metadata, key.url)
  await writeAudioMetadata(metadata)
}

async function fetchAndStoreFullAudio(request, key) {
  const headers = new Headers(request.headers)
  headers.delete("range")
  const fullRequest = new Request(request.url, {
    method: "GET",
    headers,
    credentials: "same-origin",
    cache: "no-store",
  })
  const response = await fetch(fullRequest)
  await storeAudioResponse(key, response)
}

async function rangedAudioResponse(response, rangeHeader) {
  if (!rangeHeader) return response
  const blob = await response.blob()
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
  if (!match || blob.size === 0) return response

  let start
  let end
  if (match[1] === "") {
    const suffixLength = Number(match[2])
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return response
    start = Math.max(0, blob.size - suffixLength)
    end = blob.size - 1
  } else {
    start = Number(match[1])
    end = match[2] === "" ? blob.size - 1 : Number(match[2])
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= blob.size || end < start) {
    return new Response(null, {
      status: 416,
      headers: { "content-range": `bytes */${blob.size}` },
    })
  }
  end = Math.min(end, blob.size - 1)
  const chunk = blob.slice(start, end + 1, response.headers.get("content-type") || "audio/mpeg")
  return new Response(chunk, {
    status: 206,
    headers: {
      "accept-ranges": "bytes",
      "content-length": String(chunk.size),
      "content-range": `bytes ${start}-${end}/${blob.size}`,
      "content-type": chunk.type || "audio/mpeg",
    },
  })
}

async function handleAudioRequest(event) {
  const url = new URL(event.request.url)
  const key = audioCacheKey(url)
  if (!key) return fetch(event.request)
  const audioCache = await caches.open(AUDIO_CACHE_NAME)
  const cached = await audioCache.match(key)
  if (cached) {
    event.waitUntil(touchAudioEntry(key).catch(() => {}))
    return rangedAudioResponse(cached, event.request.headers.get("range"))
  }

  const response = await fetch(event.request)
  if (response.status === 200) {
    event.waitUntil(storeAudioResponse(key, response.clone()).catch(() => {}))
  } else if (response.status === 206) {
    event.waitUntil(fetchAndStoreFullAudio(event.request, key).catch(() => {}))
  }
  return response
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell())
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(STATIC_CACHE_PREFIX) && key !== STATIC_CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname === "/rest/stream.view") {
    event.respondWith(handleAudioRequest(event))
    return
  }

  if (event.request.mode === "navigate" && url.pathname.startsWith("/tesla/")) {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(STATIC_CACHE_NAME)
        return cache.match(APP_SHELL_URL)
      }),
    )
    return
  }

  const isStaticAsset = url.pathname.startsWith("/tesla/assets/") || url.pathname.startsWith("/tesla/icons/")
  if (!isStaticAsset) return
  event.respondWith(
    caches.open(STATIC_CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request)
      if (cached) return cached
      const response = await fetch(event.request)
      if (response.ok) cache.put(event.request, response.clone())
      return response
    }),
  )
})
