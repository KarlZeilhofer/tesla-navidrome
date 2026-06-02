import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Heart,
  ListMusic,
  ListPlus,
  LogOut,
  MoreVertical,
  Pause,
  Play,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  GripVertical,
  X,
} from "lucide-react"
import "./styles.css"

const CLIENT = "TeslaNavidrome"
const API_VERSION = "1.16.1"
const STORAGE_KEY = "teslaNavidromeState"
const THEME_KEY = "teslaNavidromeTheme"
const SKIP_STATS_KEY = "teslaNavidromeSkipStats"
const USER_PROFILES_KEY = "teslaNavidromeUserProfiles"
const MIN_FUTURE = 8
const MAX_HISTORY = 200
const AUTH_KEYS = [
  "token",
  "userId",
  "name",
  "username",
  "avatar",
  "role",
  "subsonic-salt",
  "subsonic-token",
  "is-authenticated",
]

function authState() {
  return {
    jwt: localStorage.getItem("token") || "",
    username: localStorage.getItem("username") || "",
    salt: localStorage.getItem("subsonic-salt") || "",
    subsonicToken: localStorage.getItem("subsonic-token") || "",
    name: localStorage.getItem("name") || localStorage.getItem("username") || "",
    isAuthenticated: localStorage.getItem("is-authenticated") === "true",
  }
}

function currentAuthProfile() {
  const auth = authState()
  if (!auth.username) return null
  const profile = { ...auth }
  for (const key of AUTH_KEYS) profile[key] = localStorage.getItem(key) || ""
  return profile
}

function loadUserProfiles() {
  try {
    const profiles = JSON.parse(localStorage.getItem(USER_PROFILES_KEY) || "[]")
    return Array.isArray(profiles) ? profiles.filter((profile) => profile?.username) : []
  } catch {
    return []
  }
}

function saveUserProfiles(profiles) {
  localStorage.setItem(USER_PROFILES_KEY, JSON.stringify(profiles))
}

function rememberCurrentAuthProfile() {
  const profile = currentAuthProfile()
  if (!profile) return loadUserProfiles()
  const profiles = loadUserProfiles().filter((item) => item.username !== profile.username)
  const nextProfiles = [{ ...profile, savedAt: Date.now() }, ...profiles]
  saveUserProfiles(nextProfiles)
  return nextProfiles
}

function activateUserProfile(profile) {
  for (const key of AUTH_KEYS) {
    if (profile[key]) localStorage.setItem(key, profile[key])
    else localStorage.removeItem(key)
  }
  localStorage.setItem("is-authenticated", "true")
}

function storeAuth(data) {
  if (data.token) localStorage.setItem("token", data.token)
  localStorage.setItem("userId", data.id)
  localStorage.setItem("name", data.name || data.username)
  localStorage.setItem("username", data.username)
  if (data.avatar) localStorage.setItem("avatar", data.avatar)
  localStorage.setItem("role", data.isAdmin ? "admin" : "regular")
  localStorage.setItem("subsonic-salt", data.subsonicSalt)
  localStorage.setItem("subsonic-token", data.subsonicToken)
  localStorage.setItem("is-authenticated", "true")
  rememberCurrentAuthProfile()
}

function clearAuth() {
  AUTH_KEYS.forEach((key) => localStorage.removeItem(key))
}

function subsonicUrl(command, params = {}, auth = authState()) {
  const query = new URLSearchParams({
    u: auth.username,
    t: auth.subsonicToken,
    s: auth.salt,
    v: API_VERSION,
    c: CLIENT,
    f: "json",
  })
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item))
    } else {
      query.append(key, value)
    }
  }
  return `/rest/${command}.view?${query.toString()}`
}

async function subsonic(command, params, auth) {
  const response = await fetch(subsonicUrl(command, params, auth))
  const json = await response.json()
  const payload = json["subsonic-response"]
  if (!response.ok || payload?.status === "failed") {
    throw new Error(payload?.error?.message || response.statusText)
  }
  return payload
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${String(secs).padStart(2, "0")}`
}

function normalizeSong(song) {
  return {
    id: song.id,
    title: song.title || "Untitled",
    artist: song.artist || song.albumArtist || "Unbekannter Künstler",
    album: song.album || "",
    albumId: song.albumId || "",
    artistId: song.artistId || "",
    duration: song.duration || 0,
    coverArt: song.coverArt,
    starred: Boolean(song.starred),
  }
}

function normalizePlaylist(playlist) {
  return {
    id: playlist.id,
    name: playlist.name || "Playlist",
    songCount: playlist.songCount || 0,
    duration: playlist.duration || 0,
    coverArt: playlist.coverArt,
    owner: playlist.owner || "",
  }
}

function normalizeAlbum(album) {
  return {
    id: album.id,
    name: album.name || album.title || "Album",
    artist: album.artist || album.albumArtist || "",
    songCount: album.songCount || 0,
    coverArt: album.coverArt,
  }
}

function normalizeArtist(artist) {
  return {
    id: artist.id || artist.name,
    name: artist.name || "Künstler",
    albumCount: artist.albumCount || 0,
  }
}

function matchesPlaylistQuery(playlist, query) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return false
  if ("playlist".startsWith(normalizedQuery)) return true
  return playlist.name.toLocaleLowerCase().includes(normalizedQuery)
}

function stateStorageKey(username) {
  return username ? `${STORAGE_KEY}:${username}` : STORAGE_KEY
}

function loadSavedState(username = authState().username) {
  try {
    const userKey = stateStorageKey(username)
    let raw = username ? localStorage.getItem(userKey) : localStorage.getItem(STORAGE_KEY)
    if (!raw && username) {
      raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        localStorage.setItem(userKey, raw)
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    raw ||= "{}"
    const saved = JSON.parse(raw)
    if (!Array.isArray(saved.verlauf)) return null
    return {
      verlauf: saved.verlauf.slice(-MAX_HISTORY - MIN_FUTURE),
      currentIndex: Math.max(-1, Number(saved.currentIndex ?? -1)),
      position: Number(saved.position || 0),
      wasPlaying: Boolean(saved.wasPlaying),
    }
  } catch {
    return null
  }
}

function saveState({ verlauf, currentIndex, position, wasPlaying, username }) {
  localStorage.setItem(
    stateStorageKey(username),
    JSON.stringify({
      verlauf: verlauf.slice(-MAX_HISTORY - MIN_FUTURE),
      currentIndex,
      position,
      wasPlaying,
      savedAt: Date.now(),
    }),
  )
}

function loadSkipStats() {
  try {
    return JSON.parse(localStorage.getItem(SKIP_STATS_KEY) || "{}")
  } catch {
    return {}
  }
}

function saveSkipStats(stats) {
  localStorage.setItem(SKIP_STATS_KEY, JSON.stringify(stats))
}

function App() {
  const initialAuth = useMemo(authState, [])
  const savedState = useMemo(() => loadSavedState(initialAuth.username), [initialAuth.username])
  const [auth, setAuth] = useState(initialAuth)
  const [query, setQuery] = useState("")
  const [songs, setSongs] = useState([])
  const [playlistResults, setPlaylistResults] = useState([])
  const [albumResults, setAlbumResults] = useState([])
  const [artistResults, setArtistResults] = useState([])
  const [resultTitle, setResultTitle] = useState("Treffer")
  const [playlistView, setPlaylistView] = useState(null)
  const [searchMode, setSearchMode] = useState("home")
  const [verlauf, setVerlauf] = useState(savedState?.verlauf || [])
  const [currentIndex, setCurrentIndex] = useState(savedState?.currentIndex ?? -1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [status, setStatus] = useState("")
  const [time, setTime] = useState({ current: savedState?.position || 0, duration: 0 })
  const [theme, setTheme] = useState(localStorage.getItem(THEME_KEY) || "auto")
  const [showPassword, setShowPassword] = useState(false)
  const [menu, setMenu] = useState(null)
  const [playlists, setPlaylists] = useState([])
  const [userProfiles, setUserProfiles] = useState(loadUserProfiles)
  const [newPlaylistName, setNewPlaylistName] = useState("")
  const [dragState, setDragState] = useState(null)
  const audioRef = useRef(null)
  const searchInputRef = useRef(null)
  const currentRowRef = useRef(null)
  const pendingSeekRef = useRef(savedState?.position || 0)
  const didRestorePositionRef = useRef(false)
  const didLoadInitialResultsRef = useRef(false)
  const randomRefillRunning = useRef(false)
  const skipStatsRef = useRef(loadSkipStats())
  const playStartRef = useRef({ songId: "", startedAt: 0, duration: 0 })

  const currentSong = currentIndex >= 0 ? verlauf[currentIndex] : null
  const futureCount = Math.max(0, verlauf.length - currentIndex - 1)
  const canUseApi = auth.username && auth.subsonicToken && auth.salt
  const isEditablePlaylist = playlistView?.type === "playlist"

  const streamUrl = useMemo(() => {
    if (!currentSong || !canUseApi) return ""
    return subsonicUrl("stream", { id: currentSong.id, maxBitRate: 320 }, auth)
  }, [auth, canUseApi, currentSong])

  const addRandomFuture = useCallback(
    async (count = MIN_FUTURE) => {
      if (!canUseApi || randomRefillRunning.current) return []
      randomRefillRunning.current = true
      try {
        const data = await subsonic("getRandomSongs", { size: count }, auth)
        const randomSongs = (data.randomSongs?.song || []).map(normalizeSong)
        if (randomSongs.length) {
          setVerlauf((items) => [...items, ...randomSongs])
        }
        return randomSongs
      } catch (err) {
        setStatus(err.message)
        return []
      } finally {
        randomRefillRunning.current = false
      }
    },
    [auth, canUseApi],
  )

  function recordSkip(songId, playedSeconds, durationSeconds) {
    if (!songId || !Number.isFinite(playedSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return
    const ratio = playedSeconds / durationSeconds
    if (ratio <= 0.1 || ratio >= 0.5) return
    const nextStats = {
      ...skipStatsRef.current,
      [songId]: {
        skips: (skipStatsRef.current[songId]?.skips || 0) + 1,
        lastRatio: ratio,
        lastSkippedAt: Date.now(),
      },
    }
    skipStatsRef.current = nextStats
    saveSkipStats(nextStats)
  }

  function markCurrentSongSkip() {
    const audio = audioRef.current
    const songId = currentSong?.id || playStartRef.current.songId
    if (!songId || !audio) return
    recordSkip(songId, audio.currentTime || 0, audio.duration || currentSong?.duration || playStartRef.current.duration)
    playStartRef.current = { songId: "", startedAt: 0, duration: 0 }
  }

  const next = useCallback(async () => {
    markCurrentSongSkip()
    const currentFutureCount = Math.max(0, verlauf.length - currentIndex - 1)
    const added = currentIndex >= 0 && currentFutureCount < MIN_FUTURE ? await addRandomFuture(MIN_FUTURE - currentFutureCount) : []
    const availableLength = verlauf.length + added.length
    setCurrentIndex((idx) => {
      if (idx < 0) return idx
      return Math.min(availableLength - 1, idx + 1)
    })
  }, [addRandomFuture, currentIndex, currentSong, verlauf.length])

  const previous = useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      setTime((value) => ({ ...value, current: 0 }))
      return
    }
    markCurrentSongSkip()
    const currentFutureCount = Math.max(0, verlauf.length - currentIndex - 1)
    if (currentIndex >= 0 && currentFutureCount < MIN_FUTURE) {
      addRandomFuture(MIN_FUTURE - currentFutureCount)
    }
    setCurrentIndex((idx) => Math.max(0, idx - 1))
  }, [addRandomFuture, currentIndex, currentSong, verlauf.length])

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    if (!currentSong && songs.length) {
      insertAndPlay(songs[0])
      return
    }
    if (audio.paused) {
      await audio.play()
    } else {
      audio.pause()
    }
  }, [currentSong, songs])

  useEffect(() => {
    if (auth.isAuthenticated && canUseApi) {
      setUserProfiles(rememberCurrentAuthProfile())
      subsonic("ping", {}, auth).catch(() => {
        setStatus("Login gefunden, aber API-Zugriff fehlgeschlagen. Bitte neu einloggen.")
      })
    }
  }, [auth, canUseApi])

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.username) return
    const nextSavedState = loadSavedState(auth.username)
    setVerlauf(nextSavedState?.verlauf || [])
    setCurrentIndex(nextSavedState?.currentIndex ?? -1)
    setTime({ current: nextSavedState?.position || 0, duration: 0 })
    pendingSeekRef.current = nextSavedState?.position || 0
    didRestorePositionRef.current = false
    didLoadInitialResultsRef.current = false
    setSongs([])
    setPlaylistResults([])
    setAlbumResults([])
    setArtistResults([])
    setPlaylistView(null)
    setResultTitle("Treffer")
    setQuery("")
    setSearchMode("home")
  }, [auth.username])

  useEffect(() => {
    if (playlistView) return
    if (!query.trim() || !canUseApi) {
      setSongs([])
      setPlaylistResults([])
      setAlbumResults([])
      setArtistResults([])
      setResultTitle("Treffer")
      return
    }
    const handle = window.setTimeout(async () => {
      try {
        setStatus("Suche...")
        const [data, playlistData] = await Promise.all([
          subsonic(
            "search3",
            {
              query,
              artistCount: 0,
              albumCount: 4,
              songCount: 40,
            },
            auth,
          ),
          subsonic("getPlaylists", {}, auth),
        ])
        setSongs((data.searchResult3?.song || []).map(normalizeSong))
        setAlbumResults((data.searchResult3?.album || []).map(normalizeAlbum))
        setArtistResults([])
        setResultTitle("Treffer")
        setPlaylistResults(
          (playlistData.playlists?.playlist || [])
            .map(normalizePlaylist)
            .filter((playlist) => matchesPlaylistQuery(playlist, query)),
        )
        setStatus("")
      } catch (err) {
        setStatus(err.message)
      }
    }, 250)
    return () => window.clearTimeout(handle)
  }, [auth, canUseApi, playlistView, query])

  useEffect(() => {
    if (!canUseApi || didLoadInitialResultsRef.current || playlistView || query.trim()) return
    didLoadInitialResultsRef.current = true
    randomPlay()
  }, [canUseApi, playlistView, query])

  useEffect(() => {
    if (currentIndex <= MAX_HISTORY || verlauf.length <= MAX_HISTORY + MIN_FUTURE) return
    const drop = currentIndex - MAX_HISTORY
    setVerlauf((items) => items.slice(drop))
    setCurrentIndex((idx) => idx - drop)
  }, [currentIndex, verlauf.length])

  useEffect(() => {
    if (!auth.username) return
    saveState({
      verlauf,
      currentIndex,
      position: audioRef.current?.currentTime || time.current || 0,
      wasPlaying: isPlaying,
      username: auth.username,
    })
  }, [auth.username, currentIndex, isPlaying, time.current, verlauf])

  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [currentIndex])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (searchMode !== "search") return
    window.setTimeout(() => searchInputRef.current?.focus(), 0)
  }, [searchMode])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => {
      setTime({ current: audio.currentTime || 0, duration: audio.duration || currentSong?.duration || 0 })
    }
    const onLoaded = () => {
      if (pendingSeekRef.current > 0 && Number.isFinite(audio.duration)) {
        audio.currentTime = Math.min(pendingSeekRef.current, Math.max(0, audio.duration - 1))
        pendingSeekRef.current = 0
      }
    }
    const onEnded = () => next()
    const onPlay = () => {
      playStartRef.current = {
        songId: currentSong?.id || "",
        startedAt: audio.currentTime || 0,
        duration: audio.duration || currentSong?.duration || 0,
      }
      setIsPlaying(true)
    }
    const onPause = () => setIsPlaying(false)
    audio.addEventListener("timeupdate", onTime)
    audio.addEventListener("durationchange", onTime)
    audio.addEventListener("loadedmetadata", onLoaded)
    audio.addEventListener("ended", onEnded)
    audio.addEventListener("play", onPlay)
    audio.addEventListener("pause", onPause)
    return () => {
      audio.removeEventListener("timeupdate", onTime)
      audio.removeEventListener("durationchange", onTime)
      audio.removeEventListener("loadedmetadata", onLoaded)
      audio.removeEventListener("ended", onEnded)
      audio.removeEventListener("play", onPlay)
      audio.removeEventListener("pause", onPause)
    }
  }, [currentSong?.duration, currentSong?.id, next])

  useEffect(() => {
    const previousSong = playStartRef.current
    if (!previousSong.songId || previousSong.songId === currentSong?.id) return
    recordSkip(previousSong.songId, time.current, time.duration || previousSong.duration)
    playStartRef.current = { songId: "", startedAt: 0, duration: 0 }
  }, [currentSong?.id])

  useEffect(() => {
    if (!streamUrl || !audioRef.current) return
    const shouldRestore =
      !didRestorePositionRef.current &&
      currentSong?.id === savedState?.verlauf?.[savedState.currentIndex]?.id &&
      savedState.position > 0
    pendingSeekRef.current = shouldRestore ? savedState.position : 0
    didRestorePositionRef.current = true
    audioRef.current.removeAttribute("poster")
    audioRef.current.src = streamUrl
    audioRef.current.play().catch((err) => {
      if (savedState?.wasPlaying) {
        setStatus(`Zum Fortsetzen bitte Play tippen: ${err.message}`)
      }
    })
  }, [currentSong?.id, savedState, streamUrl])

  useEffect(() => {
    if (!("mediaSession" in navigator)) return
    navigator.mediaSession.metadata = currentSong
      ? new MediaMetadata({
          title: currentSong.title,
          artist: currentSong.artist,
          album: currentSong.album,
        })
      : null
    const setHandler = (action, handler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler)
      } catch {
        // Some Chromium builds expose Media Session but not every action.
      }
    }
    setHandler("play", () => audioRef.current?.play())
    setHandler("pause", () => audioRef.current?.pause())
    setHandler("previoustrack", previous)
    setHandler("nexttrack", next)
    setHandler("seekbackward", previous)
    setHandler("seekforward", next)
  }, [currentSong, next, previous])

  useEffect(() => {
    const handleKey = (event) => {
      const tag = event.target?.tagName?.toLowerCase()
      if (tag === "input" || tag === "textarea" || event.target?.isContentEditable) return
      if (event.key === "MediaTrackNext") next()
      if (event.key === "MediaTrackPrevious") previous()
      if (event.key === "MediaPlayPause" || event.key === " ") {
        event.preventDefault()
        togglePlayback()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [next, previous, togglePlayback])

  async function login(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      setStatus("Login...")
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password"),
        }),
      })
      if (!response.ok) throw new Error("Login fehlgeschlagen")
      const data = await response.json()
      storeAuth(data)
      setAuth(authState())
      setStatus("")
    } catch (err) {
      setStatus(err.message)
    }
  }

  function insertAndPlay(song) {
    markCurrentSongSkip()
    setVerlauf((items) => {
      const index = currentIndex >= 0 ? currentIndex : -1
      return [...items.slice(0, index + 1), song, ...items.slice(index + 1)]
    })
    setCurrentIndex((idx) => idx + 1)
  }

  function addToVerlauf(song) {
    setVerlauf((items) => {
      const nextItems = [...items, song]
      if (currentIndex < 0) setCurrentIndex(0)
      return nextItems
    })
    setStatus(`Zum Verlauf hinzugefuegt: ${song.title}`)
  }

  function insertAfterCurrent(song) {
    setVerlauf((items) => {
      const index = currentIndex >= 0 ? currentIndex : -1
      return [...items.slice(0, index + 1), song, ...items.slice(index + 1)]
    })
    if (currentIndex < 0) setCurrentIndex(0)
    setStatus(`Nach aktuellem Song eingefuegt: ${song.title}`)
  }

  function playAllResults() {
    if (!songs.length) return
    markCurrentSongSkip()
    setVerlauf((items) => [...items.slice(0, currentIndex + 1), ...songs])
    setCurrentIndex((idx) => (idx < 0 ? 0 : idx + 1))
    setMenu(null)
  }

  function insertAllResults() {
    if (!songs.length) return
    setVerlauf((items) => [...items.slice(0, currentIndex + 1), ...songs, ...items.slice(currentIndex + 1)])
    if (currentIndex < 0) setCurrentIndex(0)
    setMenu(null)
  }

  function appendAllResults() {
    if (!songs.length) return
    setVerlauf((items) => [...items, ...songs])
    if (currentIndex < 0) setCurrentIndex(0)
    setMenu(null)
  }

  function replaceVerlaufWithResults() {
    if (!songs.length) return
    markCurrentSongSkip()
    setVerlauf(songs)
    setCurrentIndex(0)
    setMenu(null)
  }

  async function showPlaylist(playlist) {
    try {
      setStatus(`Lade Playlist: ${playlist.name}`)
      const data = await subsonic("getPlaylist", { id: playlist.id }, auth)
      const playlistSongs = (data.playlist?.entry || []).map(normalizeSong)
      setPlaylistView({
        type: "playlist",
        id: playlist.id,
        name: playlist.name,
        previousSongs: songs,
        previousPlaylists: playlistResults,
        previousAlbums: albumResults,
        previousArtists: artistResults,
        previousTitle: resultTitle,
      })
      setSongs(playlistSongs)
      setPlaylistResults([])
      setAlbumResults([])
      setArtistResults([])
      setResultTitle(playlist.name)
      setStatus("")
    } catch (err) {
      setStatus(err.message)
    }
  }

  function closePlaylistView() {
    setSongs(playlistView?.previousSongs || [])
    setPlaylistResults(playlistView?.previousPlaylists || [])
    setAlbumResults(playlistView?.previousAlbums || [])
    setArtistResults(playlistView?.previousArtists || [])
    setResultTitle(playlistView?.previousTitle || "Treffer")
    setPlaylistView(null)
    setMenu(null)
  }

  async function toggleStar() {
    if (!currentSong) return
    try {
      await subsonic(currentSong.starred ? "unstar" : "star", { id: currentSong.id }, auth)
      const update = (item) => (item.id === currentSong.id ? { ...item, starred: !currentSong.starred } : item)
      setSongs((items) => items.map(update))
      setVerlauf((items) => items.map(update))
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function randomPlay() {
    try {
      setStatus("Lade zufaellige Songs...")
      const data = await subsonic("getRandomSongs", { size: 30 }, auth)
      const randomSongs = (data.randomSongs?.song || []).map(normalizeSong)
      setSongs(randomSongs)
      setPlaylistResults([])
      setAlbumResults([])
      setArtistResults([])
      setPlaylistView(null)
      setResultTitle("Zufall")
      setStatus("")
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function showLikedSongs() {
    try {
      setStatus("Lade gelikte Songs...")
      const data = await subsonic("getStarred2", {}, auth)
      const likedSongs = (data.starred2?.song || []).map(normalizeSong)
      setSongs(likedSongs)
      setPlaylistResults([])
      setAlbumResults([])
      setArtistResults([])
      setPlaylistView(null)
      setResultTitle("Liked")
      setStatus("")
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function showAllPlaylists() {
    try {
      setStatus("Lade Playlists...")
      const data = await subsonic("getPlaylists", {}, auth)
      setSongs([])
      setPlaylistResults((data.playlists?.playlist || []).map(normalizePlaylist))
      setAlbumResults([])
      setArtistResults([])
      setPlaylistView(null)
      setResultTitle("Playlists")
      setStatus("")
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function showAllAlbums() {
    try {
      setStatus("Lade Alben...")
      const data = await subsonic("getAlbumList2", { type: "alphabeticalByName", size: 500 }, auth)
      setSongs([])
      setPlaylistResults([])
      setAlbumResults((data.albumList2?.album || []).map(normalizeAlbum))
      setArtistResults([])
      setPlaylistView(null)
      setResultTitle("Alben")
      setStatus("")
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function showAllArtists() {
    try {
      setStatus("Lade Künstler...")
      const data = await subsonic("getArtists", {}, auth)
      const artists = (data.artists?.index || []).flatMap((index) => index.artist || []).map(normalizeArtist)
      setSongs([])
      setPlaylistResults([])
      setAlbumResults([])
      setArtistResults(artists)
      setPlaylistView(null)
      setResultTitle("Künstler")
      setStatus("")
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function showAlbumResult(album) {
    try {
      setStatus(`Lade Album: ${album.name}`)
      const data = await subsonic("getAlbum", { id: album.id }, auth)
      setPlaylistView({
        type: "album",
        id: album.id,
        name: album.name,
        previousSongs: songs,
        previousPlaylists: playlistResults,
        previousAlbums: albumResults,
        previousArtists: artistResults,
        previousTitle: resultTitle,
      })
      setSongs((data.album?.song || []).map(normalizeSong))
      setPlaylistResults([])
      setAlbumResults([])
      setArtistResults([])
      setResultTitle(`Album ${album.name}`)
      setStatus("")
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function showArtistResult(artist) {
    await showArtist({ artist: artist.name, artistId: artist.id })
  }

  async function showAlbum(song) {
    if (!song.albumId) {
      setStatus("Kein Album für diesen Song gefunden.")
      return
    }
    try {
      const data = await subsonic("getAlbum", { id: song.albumId }, auth)
      setPlaylistView({
        type: "album",
        id: song.albumId,
        name: song.album || "Album",
        previousSongs: songs,
        previousPlaylists: playlistResults,
        previousAlbums: albumResults,
        previousArtists: artistResults,
        previousTitle: resultTitle,
      })
      setSongs((data.album?.song || []).map(normalizeSong))
      setPlaylistResults([])
      setAlbumResults([])
      setArtistResults([])
      setResultTitle(`Album ${song.album || ""}`.trim())
      setStatus(`Album: ${song.album}`)
      setMenu(null)
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function showArtist(song) {
    if (!song.artist) {
      setStatus("Kein Künstler für diesen Song gefunden.")
      return
    }
    try {
      setStatus(`Lade Künstler: ${song.artist}`)
      const data = await subsonic(
        "search3",
        {
          query: song.artist,
          artistCount: 0,
          albumCount: 0,
          songCount: 80,
        },
        auth,
      )
      setPlaylistView({
        type: "artist",
        id: song.artistId || song.artist,
        name: song.artist,
        previousSongs: songs,
        previousPlaylists: playlistResults,
        previousAlbums: albumResults,
        previousArtists: artistResults,
        previousTitle: resultTitle,
      })
      setSongs((data.searchResult3?.song || []).map(normalizeSong))
      setPlaylistResults([])
      setAlbumResults([])
      setArtistResults([])
      setResultTitle(`Künstler ${song.artist}`)
      setStatus("")
      setMenu(null)
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function loadPlaylists() {
    try {
      const data = await subsonic("getPlaylists", {}, auth)
      setPlaylists(data.playlists?.playlist || [])
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function addSongToPlaylist(playlistId, songId) {
    try {
      await subsonic("updatePlaylist", { playlistId, songIdToAdd: songId }, auth)
      setStatus("Zur Playlist hinzugefuegt.")
      setMenu(null)
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function addVerlaufToPlaylist(playlistId) {
    if (!verlauf.length) return
    try {
      await subsonic("updatePlaylist", { playlistId, songIdToAdd: verlauf.map((song) => song.id) }, auth)
      setStatus("Verlauf an Playlist angehaengt.")
      setMenu(null)
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function createPlaylistWithVerlauf() {
    if (!newPlaylistName.trim() || !verlauf.length) return
    try {
      await subsonic("createPlaylist", { name: newPlaylistName.trim(), songId: verlauf.map((song) => song.id) }, auth)
      setNewPlaylistName("")
      setStatus("Playlist aus Verlauf erstellt.")
      setMenu(null)
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function createPlaylistWithSong(songId) {
    if (!newPlaylistName.trim()) return
    try {
      await subsonic("createPlaylist", { name: newPlaylistName.trim(), songId }, auth)
      setNewPlaylistName("")
      setStatus("Playlist erstellt.")
      setMenu(null)
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function removeFromPlaylist(index) {
    if (!isEditablePlaylist) return
    try {
      await subsonic("updatePlaylist", { playlistId: playlistView.id, songIndexToRemove: index }, auth)
      setSongs((items) => items.filter((_, itemIndex) => itemIndex !== index))
      setStatus("Aus der Playlist entfernt.")
      setMenu(null)
    } catch (err) {
      setStatus(err.message)
    }
  }

  function removeFromVerlauf(index) {
    setVerlauf((items) => items.filter((_, itemIndex) => itemIndex !== index))
    setCurrentIndex((idx) => {
      if (index < idx) return idx - 1
      if (index === idx) return Math.min(idx, Math.max(0, verlauf.length - 2))
      return idx
    })
    setMenu(null)
  }

  function removePastSongs() {
    if (currentIndex <= 0) return
    setVerlauf((items) => items.slice(currentIndex))
    setCurrentIndex(0)
    setMenu(null)
  }

  function removeFutureSongs() {
    if (currentIndex < 0) return
    setVerlauf((items) => items.slice(0, currentIndex + 1))
    setMenu(null)
  }

  function removeDislikedSongs() {
    const dislikedIds = new Set(
      Object.entries(skipStatsRef.current)
        .filter(([, stats]) => stats.skips > 0 && stats.lastRatio > 0.1 && stats.lastRatio < 0.5)
        .map(([songId]) => songId),
    )
    if (!dislikedIds.size) {
      setStatus("Keine unbeliebten Songs im Verlauf gefunden.")
      setMenu(null)
      return
    }
    setVerlauf((items) => {
      const currentSongId = currentSong?.id
      let removedBeforeCurrent = 0
      const filtered = items.filter((song, index) => {
        if (song.id === currentSongId) return true
        const remove = dislikedIds.has(song.id)
        if (remove && index < currentIndex) removedBeforeCurrent += 1
        return !remove
      })
      setCurrentIndex((idx) => Math.max(0, idx - removedBeforeCurrent))
      return filtered
    })
    setStatus("Unbeliebte Songs aus dem Verlauf entfernt.")
    setMenu(null)
  }

  function moveVerlaufItem(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return
    setVerlauf((items) => {
      if (fromIndex >= items.length || toIndex >= items.length) return items
      const nextItems = [...items]
      const [moved] = nextItems.splice(fromIndex, 1)
      nextItems.splice(toIndex, 0, moved)
      return nextItems
    })
    setCurrentIndex((idx) => {
      if (idx === fromIndex) return toIndex
      if (fromIndex < idx && toIndex >= idx) return idx - 1
      if (fromIndex > idx && toIndex <= idx) return idx + 1
      return idx
    })
  }

  async function savePlaylistOrder(nextSongs) {
    if (!isEditablePlaylist) return
    try {
      await subsonic("createPlaylist", { playlistId: playlistView.id, songId: nextSongs.map((song) => song.id) }, auth)
      setStatus("Playlist umsortiert.")
    } catch (err) {
      setStatus(err.message)
    }
  }

  function movePlaylistItem(fromIndex, toIndex) {
    if (!isEditablePlaylist || fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return
    setSongs((items) => {
      if (fromIndex >= items.length || toIndex >= items.length) return items
      const nextItems = [...items]
      const [moved] = nextItems.splice(fromIndex, 1)
      nextItems.splice(toIndex, 0, moved)
      savePlaylistOrder(nextItems)
      return nextItems
    })
  }

  function movePlaylistToInsertIndex(fromIndex, insertIndex) {
    const boundedInsertIndex = Math.max(0, Math.min(insertIndex, songs.length))
    const toIndex = fromIndex < boundedInsertIndex ? boundedInsertIndex - 1 : boundedInsertIndex
    movePlaylistItem(fromIndex, toIndex)
  }

  function moveVerlaufToInsertIndex(fromIndex, insertIndex) {
    const boundedInsertIndex = Math.max(0, Math.min(insertIndex, verlauf.length))
    const toIndex = fromIndex < boundedInsertIndex ? boundedInsertIndex - 1 : boundedInsertIndex
    moveVerlaufItem(fromIndex, toIndex)
  }

  function getVerlaufInsertIndex(clientY) {
    const rows = [...document.querySelectorAll(".verlaufRow")]
    if (!rows.length) return 0
    for (const row of rows) {
      const rect = row.getBoundingClientRect()
      const rowIndex = Number(row.dataset.index)
      if (clientY < rect.top + rect.height / 2) return rowIndex
    }
    return rows.length
  }

  function getPlaylistInsertIndex(clientY) {
    const rows = [...document.querySelectorAll(".songRow.playlistSongRow")]
    if (!rows.length) return 0
    for (const row of rows) {
      const rect = row.getBoundingClientRect()
      const rowIndex = Number(row.dataset.index)
      if (clientY < rect.top + rect.height / 2) return rowIndex
    }
    return rows.length
  }

  function beginVerlaufDrag(index, event) {
    event.preventDefault()
    const updateDrag = (clientX, clientY) => {
      setDragState({
        type: "verlauf",
        fromIndex: index,
        insertIndex: getVerlaufInsertIndex(clientY),
        x: clientX,
        y: clientY,
        song: verlauf[index],
      })
    }
    updateDrag(event.clientX, event.clientY)

    const handleMove = (moveEvent) => {
      moveEvent.preventDefault()
      updateDrag(moveEvent.clientX, moveEvent.clientY)
    }
    const handleEnd = (upEvent) => {
      upEvent.preventDefault()
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleEnd)
      window.removeEventListener("pointercancel", handleCancel)
      const insertIndex = getVerlaufInsertIndex(upEvent.clientY)
      setDragState(null)
      moveVerlaufToInsertIndex(index, insertIndex)
    }
    const handleCancel = () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleEnd)
      window.removeEventListener("pointercancel", handleCancel)
      setDragState(null)
    }

    window.addEventListener("pointermove", handleMove, { passive: false })
    window.addEventListener("pointerup", handleEnd, { once: true })
    window.addEventListener("pointercancel", handleCancel, { once: true })
  }

  function beginPlaylistDrag(index, event) {
    if (!isEditablePlaylist) return
    event.preventDefault()
    const updateDrag = (clientX, clientY) => {
      setDragState({
        type: "playlist",
        fromIndex: index,
        insertIndex: getPlaylistInsertIndex(clientY),
        x: clientX,
        y: clientY,
        song: songs[index],
      })
    }
    updateDrag(event.clientX, event.clientY)

    const handleMove = (moveEvent) => {
      moveEvent.preventDefault()
      updateDrag(moveEvent.clientX, moveEvent.clientY)
    }
    const handleEnd = (upEvent) => {
      upEvent.preventDefault()
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleEnd)
      window.removeEventListener("pointercancel", handleCancel)
      const insertIndex = getPlaylistInsertIndex(upEvent.clientY)
      setDragState(null)
      movePlaylistToInsertIndex(index, insertIndex)
    }
    const handleCancel = () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleEnd)
      window.removeEventListener("pointercancel", handleCancel)
      setDragState(null)
    }

    window.addEventListener("pointermove", handleMove, { passive: false })
    window.addEventListener("pointerup", handleEnd, { once: true })
    window.addEventListener("pointercancel", handleCancel, { once: true })
  }


  function clearVerlauf() {
    setMenu(null)
    subsonic("getRandomSongs", { size: MIN_FUTURE }, auth)
      .then((data) => {
        const randomSongs = (data.randomSongs?.song || []).map(normalizeSong)
        setVerlauf(randomSongs)
        setCurrentIndex(randomSongs.length ? 0 : -1)
      })
      .catch((err) => setStatus(err.message))
  }

  function shuffleVerlauf() {
    if (currentIndex < 0) return
    const current = verlauf[currentIndex]
    const rest = verlauf.filter((_, index) => index !== currentIndex)
    for (let i = rest.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[rest[i], rest[j]] = [rest[j], rest[i]]
    }
    setVerlauf([current, ...rest])
    setCurrentIndex(0)
    setMenu(null)
  }

  function logout() {
    clearAuth()
    setAuth(authState())
    setVerlauf([])
    setSongs([])
    setPlaylistResults([])
    setAlbumResults([])
    setArtistResults([])
    setCurrentIndex(-1)
    setMenu(null)
  }

  function switchUser(profile) {
    if (!profile?.username) return
    audioRef.current?.pause()
    activateUserProfile(profile)
    setAuth(authState())
    setMenu(null)
  }

  function loginAnotherUser() {
    audioRef.current?.pause()
    clearAuth()
    setAuth(authState())
    setMenu(null)
  }

  if (!auth.isAuthenticated || !canUseApi) {
    return (
      <main className="loginScreen">
        <section className="loginPanel">
          <p className="eyebrow">Tesla Navidrome</p>
          <h1>Login</h1>
          <form onSubmit={login}>
            <input name="username" autoComplete="username" placeholder="Benutzer" />
            <div className="passwordField">
              <input
                name="password"
                autoComplete="current-password"
                placeholder="Passwort"
                type={showPassword ? "text" : "password"}
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Passwort zeigen">
                {showPassword ? <EyeOff size={28} /> : <Eye size={28} />}
              </button>
            </div>
            <button type="submit">Einloggen</button>
          </form>
          <p className="status">{status || "Oder zuerst in /app einloggen, dann /tesla neu laden."}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app">
      <audio ref={audioRef} preload="auto" />
      {dragState?.song && (
        <div
          className="dragGhost"
          style={{
            left: `${Math.max(8, Math.min(dragState.x + 18, window.innerWidth - 390))}px`,
            top: `${Math.max(8, Math.min(dragState.y + 18, window.innerHeight - 90))}px`,
          }}
        >
          <strong>{dragState.song.title}</strong>
          <span>{dragState.song.artist}</span>
        </div>
      )}
      <header className="playerBar">
        <div className="transportControls">
          <button className="iconButton" type="button" onClick={previous} aria-label="Back">
            <SkipBack size={34} />
          </button>
          <button className="playButton" type="button" onClick={togglePlayback} aria-label="Play pause">
            {isPlaying ? <Pause size={40} /> : <Play size={40} />}
          </button>
          <button className="iconButton" type="button" onClick={next} aria-label="Next">
            <SkipForward size={34} />
          </button>
        </div>
        <div className="nowPlaying">
          <strong>{currentSong?.title || "Bereit"}</strong>
          <span>{currentSong ? `${currentSong.artist} - ${currentSong.album}` : `Angemeldet als ${auth.name}`}</span>
          <input
            className="progress"
            type="range"
            min="0"
            max={Math.max(1, time.duration || currentSong?.duration || 1)}
            value={Math.min(time.current, time.duration || currentSong?.duration || 1)}
            onChange={(event) => {
              if (audioRef.current) audioRef.current.currentTime = Number(event.target.value)
            }}
          />
        </div>
        <button className={currentSong?.starred ? "likeNow liked" : "likeNow"} type="button" onClick={toggleStar}>
          <Heart size={28} fill={currentSong?.starred ? "currentColor" : "none"} />
          Like
        </button>
        <div className="clock">
          {formatTime(time.current)} / {formatTime(time.duration || currentSong?.duration || 0)}
        </div>
      </header>

      <section className="searchBar">
        {playlistView ? (
          <button className="backToResults" type="button" onClick={closePlaylistView}>
            <ArrowLeft size={30} />
            Zurück
          </button>
        ) : searchMode === "search" ? (
          <>
            <Search size={30} />
            <div className="searchField">
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Suche nach Titel, Album, Künstler oder Playlist"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Suche löschen">
                  <X size={28} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setQuery("")
                setSearchMode("home")
              }}
            >
              <ArrowLeft size={24} />
              Zurück
            </button>
          </>
        ) : (
          <div className="quickButtons">
            <button type="button" onClick={() => setSearchMode("search")} aria-label="Suche">
              <Search size={26} />
            </button>
            <button type="button" onClick={showAllAlbums}>Alben</button>
            <button type="button" onClick={showAllArtists}>Künstler</button>
            <button type="button" onClick={showAllPlaylists}>Playlists</button>
          </div>
        )}
        <button type="button" onClick={showLikedSongs}>
          <Heart size={24} />
          Liked
        </button>
        <button type="button" onClick={randomPlay}>
          <Shuffle size={24} />
          Zufall
        </button>
        <button className="secondaryButton userButton" type="button" onClick={() => setMenu({ type: "user" })}>
          {auth.username || auth.name}
        </button>
      </section>

      <section className="content">
        <div className="results">
          <button
            className="sectionHeader buttonHeader"
            type="button"
            disabled={!songs.length && !playlistResults.length && !albumResults.length && !artistResults.length}
            onClick={() => setMenu({ type: "results" })}
          >
            <h2>{resultTitle}</h2>
            <span>
              {status ||
                `${songs.length} Songs / ${albumResults.length} Alben / ${artistResults.length} Künstler / ${playlistResults.length} Playlists`}
            </span>
          </button>
          <div className="songList">
            {playlistResults.map((playlist) => (
              <PlaylistRow key={playlist.id} playlist={playlist} auth={auth} onSelect={() => showPlaylist(playlist)} />
            ))}
            {albumResults.map((album) => (
              <AlbumRow key={album.id} album={album} auth={auth} onSelect={() => showAlbumResult(album)} />
            ))}
            {artistResults.map((artist) => (
              <ArtistRow key={artist.id} artist={artist} onSelect={() => showArtistResult(artist)} />
            ))}
            {songs.map((song, index) => (
              <SongRow
                key={song.id}
                song={song}
                index={index}
                auth={auth}
                playlistMode={isEditablePlaylist}
                dragging={isEditablePlaylist && dragState?.type === "playlist" && dragState.fromIndex === index}
                dropPosition={
                  isEditablePlaylist && dragState?.type === "playlist" && dragState.insertIndex === index
                    ? "before"
                    : isEditablePlaylist && dragState?.type === "playlist" && dragState.insertIndex === songs.length && index === songs.length - 1
                      ? "after"
                      : ""
                }
                onPlay={() => insertAndPlay(song)}
                onQueue={() => addToVerlauf(song)}
                onMove={movePlaylistItem}
                onPointerDragStart={(event) => beginPlaylistDrag(index, event)}
                onMenu={() => {
                  setMenu({ type: isEditablePlaylist ? "playlistSong" : "song", song, index })
                  loadPlaylists()
                }}
              />
            ))}
          </div>
        </div>

        <aside className="verlauf">
          <button
            className="sectionHeader buttonHeader"
            type="button"
            onClick={() => {
              setMenu({ type: "verlauf" })
              loadPlaylists()
            }}
          >
            <h2>Verlauf</h2>
            <span>
              {Math.max(0, currentIndex)} vergangen / {futureCount} danach
            </span>
          </button>
          <div className="verlaufList">
            {verlauf.map((song, index) => (
              <VerlaufRow
                ref={index === currentIndex ? currentRowRef : null}
                key={`${song.id}-${index}`}
                song={song}
                index={index}
                active={index === currentIndex}
                dragging={dragState?.type === "verlauf" && dragState.fromIndex === index}
                dropPosition={
                  dragState?.type === "verlauf" && dragState.insertIndex === index
                    ? "before"
                    : dragState?.type === "verlauf" && dragState.insertIndex === verlauf.length && index === verlauf.length - 1
                      ? "after"
                      : ""
                }
                onClick={() => {
                  if (index !== currentIndex) markCurrentSongSkip()
                  setCurrentIndex(index)
                }}
                onMove={moveVerlaufItem}
                onPointerDragStart={(event) => beginVerlaufDrag(index, event)}
                onMenu={() => {
                  setMenu({ type: "verlaufSong", song, index })
                  loadPlaylists()
                }}
              />
            ))}
          </div>
        </aside>
      </section>

      {menu && (
        <ActionMenu
          menu={menu}
          playlists={playlists}
          newPlaylistName={newPlaylistName}
          setNewPlaylistName={setNewPlaylistName}
          onClose={() => setMenu(null)}
          onInsertAfter={() => {
            insertAfterCurrent(menu.song)
            setMenu(null)
          }}
          onAddPlaylist={(playlistId) => addSongToPlaylist(playlistId, menu.song.id)}
          onCreatePlaylist={() => createPlaylistWithSong(menu.song.id)}
          onShowAlbum={() => showAlbum(menu.song)}
          onShowArtist={() => showArtist(menu.song)}
          onRemove={() => removeFromVerlauf(menu.index)}
          onRemoveFromPlaylist={() => removeFromPlaylist(menu.index)}
          onClear={clearVerlauf}
          onRemovePast={removePastSongs}
          onRemoveFuture={removeFutureSongs}
          onShuffle={shuffleVerlauf}
          onPlayAllResults={playAllResults}
          onInsertAllResults={insertAllResults}
          onAppendAllResults={appendAllResults}
          onReplaceResults={replaceVerlaufWithResults}
          resultTitle={resultTitle}
          onLogout={logout}
          userProfiles={userProfiles}
          currentUsername={auth.username}
          onSwitchUser={switchUser}
          onLoginAnotherUser={loginAnotherUser}
          onAddVerlaufPlaylist={addVerlaufToPlaylist}
          onCreateVerlaufPlaylist={createPlaylistWithVerlauf}
          onRemoveDisliked={removeDislikedSongs}
          theme={theme}
          onThemeChange={setTheme}
        />
      )}
    </main>
  )
}

function longPress(callback) {
  let timer
  return (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    timer = window.setTimeout(callback, 550)
    const clear = () => window.clearTimeout(timer)
    event.currentTarget.addEventListener("pointerup", clear, { once: true })
    event.currentTarget.addEventListener("pointerleave", clear, { once: true })
    event.currentTarget.addEventListener("pointercancel", clear, { once: true })
  }
}

function SongRow({
  song,
  index,
  auth,
  playlistMode,
  dragging,
  dropPosition,
  onPlay,
  onQueue,
  onMove,
  onPointerDragStart,
  onMenu,
}) {
  const coverUrl = song.coverArt ? subsonicUrl("getCoverArt", { id: song.coverArt, size: 96, square: true }, auth) : ""
  const rowClassName = [
    "songRow",
    playlistMode ? "playlistSongRow" : "",
    dragging ? "dragging" : "",
    dropPosition === "before" ? "dropBefore" : "",
    dropPosition === "after" ? "dropAfter" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <article
      className={rowClassName}
      data-index={index}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const fromIndex = Number(event.dataTransfer.getData("text/plain"))
        if (Number.isFinite(fromIndex)) onMove(fromIndex, index)
      }}
    >
      {playlistMode && (
        <button
          className="dragHandle resultDragHandle"
          type="button"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("text/plain", String(index))
            event.dataTransfer.effectAllowed = "move"
          }}
          onPointerDown={onPointerDragStart}
          aria-label="Playlist Eintrag verschieben"
        >
          <GripVertical size={26} />
        </button>
      )}
      <button className="coverButton" type="button" onClick={onPlay}>
        {coverUrl ? <img src={coverUrl} alt="" /> : <Play size={34} />}
      </button>
      <button className="songText" type="button" onClick={onPlay}>
        <strong>
          {song.starred && <Heart className="inlineHeart" size={20} fill="currentColor" />} {song.title}
        </strong>
        <span>{song.artist}</span>
      </button>
      <button className="actionButton" type="button" onClick={onQueue}>
        <ListPlus size={28} />
        Anhängen
      </button>
      <button className="actionButton" type="button" onClick={onMenu} onPointerDown={longPress(onMenu)}>
        <MoreVertical size={28} />
        Mehr
      </button>
    </article>
  )
}

function PlaylistRow({ playlist, auth, onSelect }) {
  const coverUrl = playlist.coverArt ? subsonicUrl("getCoverArt", { id: playlist.coverArt, size: 96, square: true }, auth) : ""
  return (
    <article className="songRow playlistRow">
      <button className="coverButton" type="button" onClick={onSelect}>
        {coverUrl ? <img src={coverUrl} alt="" /> : <ListMusic size={34} />}
      </button>
      <button className="songText" type="button" onClick={onSelect}>
        <strong>{playlist.name}</strong>
        <span>Playlist - {playlist.songCount} Songs</span>
      </button>
    </article>
  )
}

function AlbumRow({ album, auth, onSelect }) {
  const coverUrl = album.coverArt ? subsonicUrl("getCoverArt", { id: album.coverArt, size: 96, square: true }, auth) : ""
  return (
    <article className="songRow albumRow">
      <button className="coverButton" type="button" onClick={onSelect}>
        {coverUrl ? <img src={coverUrl} alt="" /> : <ListMusic size={34} />}
      </button>
      <button className="songText" type="button" onClick={onSelect}>
        <strong>{album.name}</strong>
        <span>{album.artist || `${album.songCount} Songs`}</span>
      </button>
    </article>
  )
}

function ArtistRow({ artist, onSelect }) {
  return (
    <article className="songRow artistRow">
      <button className="coverButton" type="button" onClick={onSelect}>
        <ListMusic size={34} />
      </button>
      <button className="songText" type="button" onClick={onSelect}>
        <strong>{artist.name}</strong>
        <span>Künstler - {artist.albumCount} Alben</span>
      </button>
    </article>
  )
}

const VerlaufRow = React.forwardRef(function VerlaufRow(
  { song, index, active, dragging, dropPosition, onClick, onMove, onPointerDragStart, onMenu },
  ref,
) {
  const handleDragStart = (event) => {
    event.dataTransfer.setData("text/plain", String(index))
    event.dataTransfer.effectAllowed = "move"
  }
  const rowClassName = [
    "verlaufRow",
    active ? "active" : "",
    dragging ? "dragging" : "",
    dropPosition === "before" ? "dropBefore" : "",
    dropPosition === "after" ? "dropAfter" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <article
      className={rowClassName}
      ref={ref}
      data-index={index}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const fromIndex = Number(event.dataTransfer.getData("text/plain"))
        if (Number.isFinite(fromIndex)) onMove(fromIndex, index)
      }}
    >
      <button
        className="dragHandle"
        type="button"
        draggable
        onDragStart={handleDragStart}
        onPointerDown={onPointerDragStart}
        aria-label="Verschieben"
      >
        <GripVertical size={26} />
      </button>
      <button className="verlaufItem" type="button" onClick={onClick}>
        <strong>{song.title}</strong>
        <span>{song.artist}</span>
      </button>
      <button className="verlaufMenuButton" type="button" onClick={onMenu} aria-label="Verlauf Eintrag Aktionen">
        <MoreVertical size={28} />
      </button>
    </article>
  )
})

function ActionMenu({
  menu,
  playlists,
  newPlaylistName,
  setNewPlaylistName,
  onClose,
  onInsertAfter,
  onAddPlaylist,
  onCreatePlaylist,
  onShowAlbum,
  onShowArtist,
  onRemove,
  onRemoveFromPlaylist,
  onClear,
  onRemovePast,
  onRemoveFuture,
  onShuffle,
  onPlayAllResults,
  onInsertAllResults,
  onAppendAllResults,
  onReplaceResults,
  resultTitle,
  onLogout,
  userProfiles,
  currentUsername,
  onSwitchUser,
  onLoginAnotherUser,
  onAddVerlaufPlaylist,
  onCreateVerlaufPlaylist,
  onRemoveDisliked,
  theme,
  onThemeChange,
}) {
  const actionSheetRef = useRef(null)
  const [hasFocusedTextInput, setHasFocusedTextInput] = useState(false)
  const isSongMenu = menu.type === "song" || menu.type === "playlistSong" || menu.type === "verlaufSong"
  const menuTitle = isSongMenu ? menu.song.title : menu.type === "results" ? resultTitle : menu.type === "user" ? "Benutzer" : "Verlauf"
  const actionSheetClassName = hasFocusedTextInput ? "actionSheet inputFocused" : "actionSheet"

  function handleFocusCapture(event) {
    const tag = event.target?.tagName?.toLowerCase()
    if (tag !== "input" && tag !== "textarea") return
    setHasFocusedTextInput(true)
    window.setTimeout(() => {
      event.target?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }, 0)
  }

  function handleBlurCapture() {
    window.setTimeout(() => {
      const activeElement = document.activeElement
      const tag = activeElement?.tagName?.toLowerCase()
      const inputStillFocused =
        actionSheetRef.current?.contains(activeElement) && (tag === "input" || tag === "textarea")
      setHasFocusedTextInput(Boolean(inputStillFocused))
    }, 0)
  }

  return (
    <div className="modalBackdrop" onClick={onClose}>
      <section
        className={actionSheetClassName}
        ref={actionSheetRef}
        onClick={(event) => event.stopPropagation()}
        onFocusCapture={handleFocusCapture}
        onBlurCapture={handleBlurCapture}
      >
        <header>
          <h2>{menuTitle}</h2>
          <button type="button" onClick={onClose}>Schließen</button>
        </header>

        {menu.type === "results" && (
          <>
            <button type="button" onClick={onPlayAllResults}>Alle wiedergeben</button>
            <button type="button" onClick={onInsertAllResults}>Alle einfügen</button>
            <button type="button" onClick={onAppendAllResults}>Alle anhängen</button>
            <button type="button" onClick={onReplaceResults}>Verlauf ersetzen</button>
          </>
        )}

        {menu.type === "user" && (
          <>
            <div className="playlistBox userProfiles">
              <h3>Benutzer</h3>
              <div className="playlistList">
                {userProfiles.map((profile) => (
                  <button
                    className={profile.username === currentUsername ? "selected" : ""}
                    key={profile.username}
                    type="button"
                    onClick={() => onSwitchUser(profile)}
                  >
                    {profile.name || profile.username}
                  </button>
                ))}
              </div>
            </div>
            <div className="themeButtons">
              <button className={theme === "auto" ? "selected" : ""} type="button" onClick={() => onThemeChange("auto")}>
                Auto
              </button>
              <button className={theme === "dark" ? "selected" : ""} type="button" onClick={() => onThemeChange("dark")}>
                Dark
              </button>
              <button className={theme === "light" ? "selected" : ""} type="button" onClick={() => onThemeChange("light")}>
                Light
              </button>
            </div>
            <button type="button" onClick={onLoginAnotherUser}>
              Anmelden
            </button>
            <button type="button" onClick={onLogout}>
              <LogOut size={28} />
              Logout
            </button>
          </>
        )}

        {(menu.type === "song" || menu.type === "playlistSong") && (
          <>
            <button type="button" onClick={onInsertAfter}>Einfügen</button>
            <button type="button" onClick={onShowAlbum}>Zeige Album</button>
            <button type="button" onClick={onShowArtist}>Zeige Künstler</button>
          </>
        )}

        {menu.type === "playlistSong" && (
          <button type="button" onClick={onRemoveFromPlaylist}>
            <Trash2 size={24} />
            Aus der Playlist entfernen
          </button>
        )}

        {menu.type === "verlaufSong" && (
          <>
            <button type="button" onClick={onShowAlbum}>Zeige Album</button>
            <button type="button" onClick={onShowArtist}>Zeige Künstler</button>
            <button type="button" onClick={onRemove}>
              <Trash2 size={24} />
              Entfernen
            </button>
          </>
        )}

        {isSongMenu && (
          <div className="playlistBox">
            <h3>Zur Playlist hinzufügen</h3>
            <div className="playlistList">
              {playlists.map((playlist) => (
                <button key={playlist.id} type="button" onClick={() => onAddPlaylist(playlist.id)}>
                  <ListMusic size={24} />
                  {playlist.name}
                </button>
              ))}
            </div>
            <div className="newPlaylist">
              <input value={newPlaylistName} onChange={(event) => setNewPlaylistName(event.target.value)} placeholder="Neue Playlist" />
              <button type="button" onClick={onCreatePlaylist}>Plus</button>
            </div>
          </div>
        )}

        {menu.type === "verlauf" && (
          <>
            <button type="button" onClick={onClear}>Löschen und mit Zufall füllen</button>
            <button type="button" onClick={onRemovePast}>Entferne vergangene Songs</button>
            <button type="button" onClick={onRemoveFuture}>Entferne zukünftige Songs</button>
            <button type="button" onClick={onRemoveDisliked}>Unbeliebte Songs entfernen</button>
            <button type="button" onClick={onShuffle}>Verlauf würfeln</button>
            <div className="playlistBox">
              <h3>Verlauf an Playlist anhängen</h3>
              <div className="playlistList">
                {playlists.map((playlist) => (
                  <button key={playlist.id} type="button" onClick={() => onAddVerlaufPlaylist(playlist.id)}>
                    <ListMusic size={24} />
                    {playlist.name}
                  </button>
                ))}
              </div>
              <div className="newPlaylist">
                <input value={newPlaylistName} onChange={(event) => setNewPlaylistName(event.target.value)} placeholder="Neue Playlist" />
                <button type="button" onClick={onCreateVerlaufPlaylist}>Plus</button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

createRoot(document.getElementById("root")).render(<App />)
