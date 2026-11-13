import assert from "node:assert/strict"
import test from "node:test"
import { createRadioApi } from "../server/radio-api.mjs"

test("radio gateway enforces account visibility, ratings and liked-only candidates", async (context) => {
  const originalFetch = globalThis.fetch
  context.after(() => { globalThis.fetch = originalFetch })
  const allowed = [{ id: "high", title: "High", artist: "A", userRating: 5, starred: "today" }, { id: "low", title: "Low", artist: "B", userRating: 1 }]
  let submitted
  globalThis.fetch = async (url, options) => {
    url = String(url)
    if (url.includes("/search3.view")) return Response.json({ "subsonic-response": { status: "ok", searchResult3: { song: allowed } } })
    if (url.includes("/getStarred2.view")) return Response.json({ "subsonic-response": { status: "ok", starred2: { song: [allowed[0]] } } })
    if (url.endsWith("/recommend")) { submitted = JSON.parse(options.body); return Response.json({ matches: [{ id: "high" }, { id: "low" }, { id: "not-permitted" }], reason: "matched" }) }
    throw new Error("Unexpected request")
  }
  const api = createRadioApi({ navidromeUrl: "http://navidrome", radioUrl: "http://radio", validateAuth: async (auth) => auth.username === "family" ? "family" : null, allowedAdmins: new Set(["karl"]) })
  assert.equal((await api("/radio/recommend", {}, {})).status, 401)
  const result = await api("/radio/recommend", { username: "family" }, { minimumRating: 4, recentIds: ["high"] })
  assert.deepEqual(submitted.candidates.map((song) => song.id), ["high"])
  assert.deepEqual(result.data.songs.map((song) => song.id), ["high"])
  await api("/radio/recommend", { username: "family" }, { mode: "liked-radio", recentIds: ["high"] })
  assert.equal(submitted.candidates.length, 1)
  assert.equal(submitted.candidates[0].liked, true)
})
