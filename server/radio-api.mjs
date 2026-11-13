// This gateway enforces Navidrome permissions and ratings before vector search.
export function createRadioApi({ navidromeUrl, radioUrl = "http://127.0.0.1:4782", validateAuth, allowedAdmins }) {
  async function subsonic(auth, command, params = {}) {
    const url = new URL(`/rest/${command}.view`, navidromeUrl)
    url.search = new URLSearchParams({ u: auth.username, t: auth.token, s: auth.salt, v: "1.16.1", c: "TeslaNavidromeRadio", f: "json", ...params }).toString()
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    const data = (await response.json())["subsonic-response"]
    if (!response.ok || data?.status !== "ok") throw new Error("Navidrome-Zugriff fehlgeschlagen")
    return data
  }

  async function radio(path, body) {
    const response = await fetch(`${radioUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Audioanalyse nicht erreichbar")
    return data
  }

  return async function handleRadio(pathname, auth, body) {
    const username = await validateAuth(auth)
    if (!username) return { status: 401, data: { error: "Anmeldung ungültig" } }
    if (pathname === "/radio/info" || pathname === "/radio/override") {
      if (body.id) await subsonic(auth, "getSong", { id: String(body.id) })
      if (pathname === "/radio/override") {
        if (!allowedAdmins.has(username)) return { status: 403, data: { error: "Nur Administratoren dürfen den Inhaltstyp korrigieren" } }
        if (!body.id || !["auto", "music", "speech"].includes(body.kind)) return { status: 400, data: { error: "Ungültiger Inhaltstyp" } }
        await radio("/override", { id: String(body.id), kind: body.kind })
      }
      return { status: 200, data: await radio("/info", { id: body.id ? String(body.id) : null }) }
    }
    if (pathname !== "/radio/recommend") return { status: 404, data: { error: "Unbekannte Radio-Anfrage" } }
    const minimumRating = Math.max(0, Math.min(5, Number(body.minimumRating) || 0))
    let songs = []
    if (body.mode === "liked-radio") {
      songs = (await subsonic(auth, "getStarred2")).starred2?.song || []
    } else {
      for (let offset = 0; offset < 100_000; offset += 500) {
        const page = (await subsonic(auth, "search3", { query: "", artistCount: "0", albumCount: "0", songCount: "500", songOffset: String(offset) })).searchResult3?.song || []
        songs.push(...page)
        if (page.length < 500) break
      }
    }
    const permitted = new Map(songs.map((song) => [String(song.id), song]))
    let recentIds = Array.isArray(body.recentIds) ? body.recentIds.map(String).slice(-5) : []
    let anchorId = body.anchorId ? String(body.anchorId) : null
    const accessibleSeeds = new Set(permitted.keys())
    // LikedRadio may start from a permitted song that has not itself been liked.
    for (const id of [...new Set([...recentIds, ...(anchorId ? [anchorId] : [])])]) {
      if (!permitted.has(id)) {
        try {
          const data = await subsonic(auth, "getSong", { id })
          if (data.song?.id) accessibleSeeds.add(id)
        } catch { /* Deleted or inaccessible seed tracks must never enter the search. */ }
      }
    }
    recentIds = recentIds.filter((id) => accessibleSeeds.has(id))
    if (!accessibleSeeds.has(anchorId)) anchorId = null
    const candidates = songs.filter((song) => Number(song.userRating || 0) >= minimumRating)
    const eligibleIds = new Set(candidates.map((song) => String(song.id)))
    const result = await radio("/recommend", {
      candidates: candidates.map((song) => ({ id: String(song.id), title: song.title, artist: song.artist, rating: Number(song.userRating || 0), liked: Boolean(song.starred) })),
      recentIds,
      anchorId,
      excludeIds: Array.isArray(body.excludeIds) ? body.excludeIds.map(String).slice(-500) : [],
      skipIds: Array.isArray(body.skipIds) ? body.skipIds.map(String).slice(-200) : [],
      count: Math.max(1, Math.min(8, Number(body.count) || 3)),
    })
    return { status: 200, data: {
      songs: (result.matches || []).filter((item) => eligibleIds.has(item.id)).map((item) => permitted.get(item.id)).filter(Boolean),
      reason: result.reason,
      analysis: result.analysis,
    } }
  }
}
