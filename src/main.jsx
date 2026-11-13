import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  ArrowLeft,
  Cast,
  ChevronDown,
  ChevronUp,
  Download,
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
  Star,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  GripVertical,
  X,
} from "lucide-react"
import "./styles.css"
import { controlAuth, createControlConnection, createDeviceIdentity } from "./control.js"
import { sliderToVolume, volumeToSlider } from "./volume.js"

const CLIENT = "TeslaNavidrome"
const API_VERSION = "1.16.1"
const MOBILE_LAYOUT_QUERY = "(max-width: 700px)"
const STORAGE_KEY = "teslaNavidromeState"
const THEME_KEY = "teslaNavidromeTheme"
const UI_SCALE_KEY = "teslaNavidromeScale"
const UI_SCALE_VERSION_KEY = "teslaNavidromeScaleVersion"
const UI_SCALE_VERSION = "2"
const REPEAT_MODE_KEY = "teslaNavidromeRepeatMode"
const RATING_FILTER_KEY = "teslaNavidromeMinimumRating"
const SKIP_STATS_KEY = "teslaNavidromeSkipStats"
const USER_PROFILES_KEY = "teslaNavidromeUserProfiles"
const CURRENT_AUTH_KEY = "teslaNavidromeCurrentAuth"
const PLAYER_DEVICE_KEY = "teslaNavidromePlayerDevice"
const PLAYER_VOLUME_KEY = "teslaNavidromePlayerVolume"
const PLAYER_VOLUME_VERSION_KEY = "teslaNavidromePlayerVolumeVersion"
const PLAYER_VOLUME_VERSION = "2"
const PLAYER_MUTED_KEY = "teslaNavidromePlayerMuted"
const CONTROL_PAIRINGS_KEY = "teslaNavidromeControlPairings"
const CONTROLLER_DEVICE_KEY = "teslaNavidromeControllerDevice"
const MIN_FUTURE = 8
const RADIO_LOOKAHEAD = 3
const MAX_HISTORY = 200
const DESIGN_WIDTH = 1170
const MOBILE_SCALE_MULTIPLIER = 2
const UI_SCALE_OPTIONS = [
  { value: "very-small", label: "Sehr klein", factor: 0.4 },
  { value: "small", label: "Klein", factor: 0.6 },
  { value: "medium", label: "Mittel", factor: 0.8 },
  { value: "large", label: "Groß", factor: 1 },
  { value: "very-large", label: "Sehr groß", factor: 1.2 },
]
const REPEAT_MODES = ["playlist", "song", "radio", "liked-radio", "no-repeat"]
const RADIO_MODES = new Set(["radio", "liked-radio"])
const REPEAT_MODE_LABELS = {
  playlist: "Playlist wiederholen",
  song: "Song wiederholen",
  radio: "Radio",
  "liked-radio": "LikedRadio",
  "no-repeat": "Keine Wiederholung",
}
const RATING_FILTER_OPTIONS = [
  { value: 0, label: "Alle" },
  { value: 2, label: "2+" },
  { value: 3, label: "3+" },
  { value: 4, label: "4+" },
  { value: 5, label: "5 Sterne" },
]

function readStoredJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null")
    return value ?? fallback
  } catch {
    return fallback
  }
}

function loadPlayerDevice() {
  const stored = readStoredJson(PLAYER_DEVICE_KEY, null)
  if (stored?.id && stored?.secret) {
    return {
      id: stored.id,
      secret: stored.secret,
      name: stored.name || "Küche",
      enabled: Boolean(stored.enabled),
    }
  }
  const identity = createDeviceIdentity("player")
  const device = { ...identity, name: "Küche", enabled: false }
  localStorage.setItem(PLAYER_DEVICE_KEY, JSON.stringify(device))
  return device
}

function savePlayerDevice(device) {
  localStorage.setItem(PLAYER_DEVICE_KEY, JSON.stringify(device))
}

function loadControllerDevice() {
  const stored = readStoredJson(CONTROLLER_DEVICE_KEY, null)
  if (stored?.id) return stored
  const device = { id: createDeviceIdentity("controller").id }
  localStorage.setItem(CONTROLLER_DEVICE_KEY, JSON.stringify(device))
  return device
}

function loadControlPairings() {
  const pairings = readStoredJson(CONTROL_PAIRINGS_KEY, [])
  return Array.isArray(pairings)
    ? pairings.filter((pairing) => pairing?.playerId && pairing?.controllerId && pairing?.token)
    : []
}

function saveControlPairings(pairings) {
  localStorage.setItem(CONTROL_PAIRINGS_KEY, JSON.stringify(pairings))
}

function loadUiScale() {
  const storedScale = localStorage.getItem(UI_SCALE_KEY)
  if (localStorage.getItem(UI_SCALE_VERSION_KEY) !== UI_SCALE_VERSION) {
    const migratedScale = {
      "very-small": "small",
      small: "medium",
      medium: "large",
      large: "very-large",
      "very-large": "very-large",
    }[storedScale] || "large"
    localStorage.setItem(UI_SCALE_KEY, migratedScale)
    localStorage.setItem(UI_SCALE_VERSION_KEY, UI_SCALE_VERSION)
    return migratedScale
  }
  return UI_SCALE_OPTIONS.some((option) => option.value === storedScale) ? storedScale : "large"
}

function loadRepeatMode() {
  const storedMode = localStorage.getItem(REPEAT_MODE_KEY)
  return REPEAT_MODES.includes(storedMode) ? storedMode : "radio"
}

function ratingFilterStorageKey(username) {
  return username ? `${RATING_FILTER_KEY}:${username}` : RATING_FILTER_KEY
}

function loadMinimumRating(username) {
  const value = Number(localStorage.getItem(ratingFilterStorageKey(username)) || 0)
  return RATING_FILTER_OPTIONS.some((option) => option.value === value) ? value : 0
}

function songMatchesMinimumRating(song, minimumRating) {
  return minimumRating === 0 || Number(song?.userRating || 0) >= minimumRating
}

function viewportLayout(uiScaleFactor = 1) {
  const viewport = window.visualViewport
  const viewportWidth = viewport?.width || window.innerWidth
  const viewportHeight = viewport?.height || window.innerHeight
  const mobileMultiplier = viewportWidth <= 700 ? MOBILE_SCALE_MULTIPLIER : 1
  const width = DESIGN_WIDTH / (uiScaleFactor * mobileMultiplier)
  const scale = Math.max(0.01, viewportWidth / width)
  return {
    scale,
    width,
    height: viewportHeight / scale,
    left: viewport?.offsetLeft || 0,
    top: viewport?.offsetTop || 0,
  }
}

function emptyAuthState() {
  return {
    jwt: "",
    username: "",
    salt: "",
    subsonicToken: "",
    name: "",
    isAuthenticated: false,
  }
}

function normalizeAuthProfile(profile) {
  if (!profile?.username) {
    return emptyAuthState()
  }
  const username = profile.username || ""
  const name = profile.name || username
  const jwt = profile.jwt || profile.token || ""
  const salt = profile.salt || profile.subsonicSalt || profile["subsonic-salt"] || ""
  const subsonicToken = profile.subsonicToken || profile["subsonic-token"] || ""
  return {
    ...profile,
    jwt,
    token: profile.token || jwt,
    userId: profile.userId || profile.id || "",
    username,
    name,
    salt,
    subsonicToken,
    isAuthenticated: profile.isAuthenticated !== false && Boolean(username && salt && subsonicToken),
  }
}

function authState() {
  try {
    const profile = JSON.parse(localStorage.getItem(CURRENT_AUTH_KEY) || "null")
    if (profile?.username) return normalizeAuthProfile(profile)
  } catch {
    localStorage.removeItem(CURRENT_AUTH_KEY)
  }
  return normalizeAuthProfile(loadUserProfiles()[0])
}

function currentAuthProfile() {
  const auth = authState()
  if (!auth.username) return null
  return normalizeAuthProfile(auth)
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

function removeUserProfile(username) {
  const nextProfiles = loadUserProfiles().filter((profile) => profile.username !== username)
  saveUserProfiles(nextProfiles)
  return nextProfiles
}

function saveCurrentAuthProfile(profile) {
  localStorage.setItem(CURRENT_AUTH_KEY, JSON.stringify(normalizeAuthProfile(profile)))
}

function rememberCurrentAuthProfile(profile = currentAuthProfile()) {
  if (!profile) return loadUserProfiles()
  const normalizedProfile = normalizeAuthProfile(profile)
  saveCurrentAuthProfile(normalizedProfile)
  const profiles = loadUserProfiles().filter((item) => item.username !== profile.username)
  const nextProfiles = [{ ...normalizedProfile, savedAt: Date.now() }, ...profiles]
  saveUserProfiles(nextProfiles)
  return nextProfiles
}

function activateUserProfile(profile) {
  saveCurrentAuthProfile(profile)
}

function storeAuth(data) {
  const profile = normalizeAuthProfile({
    jwt: data.token || "",
    token: data.token || "",
    userId: data.id || "",
    id: data.id || "",
    name: data.name || data.username,
    username: data.username,
    avatar: data.avatar || "",
    role: data.isAdmin ? "admin" : "regular",
    salt: data.subsonicSalt,
    subsonicToken: data.subsonicToken,
    isAuthenticated: true,
  })
  rememberCurrentAuthProfile(profile)
}

function clearAuth() {
  localStorage.removeItem(CURRENT_AUTH_KEY)
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
    userRating: Math.max(0, Math.min(5, Number(song.userRating || 0))),
    radioGenerated: Boolean(song.radioGenerated),
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
      radioAnchor: saved.radioAnchor || null,
    }
  } catch {
    return null
  }
}

function saveState({ verlauf, currentIndex, position, wasPlaying, username, radioAnchor }) {
  localStorage.setItem(
    stateStorageKey(username),
    JSON.stringify({
      verlauf: verlauf.slice(-MAX_HISTORY - MIN_FUTURE),
      currentIndex,
      position,
      wasPlaying,
      radioAnchor,
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

function pickRandomSongs(songs, count) {
  const shuffled = [...songs]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, Math.max(0, count))
}

function App() {
  const initialAuth = useMemo(authState, [])
  const savedState = useMemo(() => loadSavedState(initialAuth.username), [initialAuth.username])
  const [uiScale, setUiScale] = useState(loadUiScale)
  const uiScaleFactor = UI_SCALE_OPTIONS.find((option) => option.value === uiScale)?.factor || 1
  const [layout, setLayout] = useState(() => viewportLayout(uiScaleFactor))
  const [auth, setAuth] = useState(initialAuth)
  const [query, setQuery] = useState("")
  const [songs, setSongs] = useState([])
  const [playlistResults, setPlaylistResults] = useState([])
  const [albumResults, setAlbumResults] = useState([])
  const [artistResults, setArtistResults] = useState([])
  const [resultTitle, setResultTitle] = useState("Treffer")
  const [playlistView, setPlaylistView] = useState(null)
  const [searchMode, setSearchMode] = useState("home")
  const [localVerlauf, setVerlauf] = useState(savedState?.verlauf || [])
  const [localCurrentIndex, setCurrentIndex] = useState(savedState?.currentIndex ?? -1)
  const [localIsPlaying, setIsPlaying] = useState(false)
  const [status, setStatus] = useState("")
  const [localTime, setTime] = useState({ current: savedState?.position || 0, duration: 0 })
  const [theme, setTheme] = useState(localStorage.getItem(THEME_KEY) || "auto")
  const [localRepeatMode, setRepeatMode] = useState(loadRepeatMode)
  const [minimumRating, setMinimumRating] = useState(() => loadMinimumRating(initialAuth.username))
  const [radioInfo, setRadioInfo] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [menu, setMenu] = useState(null)
  const [playlists, setPlaylists] = useState([])
  const [userProfiles, setUserProfiles] = useState(loadUserProfiles)
  const [newPlaylistName, setNewPlaylistName] = useState("")
  const [dragState, setDragState] = useState(null)
  const [activeContentPane, setActiveContentPane] = useState("results")
  const [showDevices, setShowDevices] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [duplicateSongs, setDuplicateSongs] = useState(null)
  const [deletePreview, setDeletePreview] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [playerDevice, setPlayerDevice] = useState(loadPlayerDevice)
  const [playerConnectionStatus, setPlayerConnectionStatus] = useState("disabled")
  const [playerConnectionMessage, setPlayerConnectionMessage] = useState("")
  const [playerPairingCode, setPlayerPairingCode] = useState(null)
  const [pairedControllers, setPairedControllers] = useState([])
  const [playerVolume, setPlayerVolume] = useState(() => {
    if (localStorage.getItem(PLAYER_VOLUME_VERSION_KEY) !== PLAYER_VOLUME_VERSION) {
      localStorage.setItem(PLAYER_VOLUME_KEY, "1")
      localStorage.setItem(PLAYER_VOLUME_VERSION_KEY, PLAYER_VOLUME_VERSION)
      return 1
    }
    const rawStoredVolume = localStorage.getItem(PLAYER_VOLUME_KEY)
    if (rawStoredVolume === null) return 1
    const storedVolume = Number(rawStoredVolume)
    return Number.isFinite(storedVolume) ? Math.max(0, Math.min(1, storedVolume)) : 1
  })
  const [playerMuted, setPlayerMuted] = useState(() => localStorage.getItem(PLAYER_MUTED_KEY) === "true")
  const [controlPairings, setControlPairings] = useState(loadControlPairings)
  const [pairingStatus, setPairingStatus] = useState("")
  const [remotePairing, setRemotePairing] = useState(null)
  const [remoteConnectionStatus, setRemoteConnectionStatus] = useState("offline")
  const [remoteConnectionMessage, setRemoteConnectionMessage] = useState("")
  const [remotePlayerOnline, setRemotePlayerOnline] = useState(false)
  const [remotePlaybackState, setRemotePlaybackState] = useState(null)
  const audioRef = useRef(null)
  const searchInputRef = useRef(null)
  const currentRowRef = useRef(null)
  const contentRef = useRef(null)
  const resultsPaneRef = useRef(null)
  const queuePaneRef = useRef(null)
  const pendingSeekRef = useRef(savedState?.position || 0)
  const didRestorePositionRef = useRef(false)
  const didLoadInitialResultsRef = useRef(false)
  const randomRefillRunning = useRef(false)
  const radioSkippedRef = useRef(new Set())
  const radioAnchorRef = useRef(savedState?.radioAnchor || null)
  const radioScopeRef = useRef(null)
  const skipStatsRef = useRef(loadSkipStats())
  const playStartRef = useRef({ songId: "", startedAt: 0, duration: 0 })
  const playerControlRef = useRef(null)
  const remoteControlRef = useRef(null)
  const playerStateSenderRef = useRef(() => {})
  const remoteCommandHandlerRef = useRef(() => {})
  const devicePressRef = useRef({ timer: null, held: false })
  const wasRemoteRef = useRef(false)
  const localPositionRef = useRef(0)

  const verlauf = remotePairing ? remotePlaybackState?.queue || [] : localVerlauf
  const currentIndex = remotePairing ? remotePlaybackState?.currentIndex ?? -1 : localCurrentIndex
  const isPlaying = remotePairing ? Boolean(remotePlaybackState?.isPlaying) : localIsPlaying
  const time = remotePairing ? { current: remotePlaybackState?.current || 0, duration: remotePlaybackState?.duration || 0 } : localTime
  const repeatMode = remotePairing ? remotePlaybackState?.repeatMode || "no-repeat" : localRepeatMode
  radioScopeRef.current = { username: auth.username, queue: localVerlauf, mode: localRepeatMode, minimumRating }

  const currentSong = currentIndex >= 0 ? verlauf[currentIndex] : null
  const futureCount = Math.max(0, verlauf.length - currentIndex - 1)
  const canUseApi = auth.username && auth.subsonicToken && auth.salt
  const canUploadMusic = auth.role === "admin" && !window.matchMedia(MOBILE_LAYOUT_QUERY).matches
  const isEditablePlaylist = playlistView?.type === "playlist"
  const visibleSongEntries = useMemo(
    () =>
      songs
        .map((song, index) => ({ song, index }))
        .filter(({ song }) => songMatchesMinimumRating(song, minimumRating)),
    [minimumRating, songs],
  )
  const visibleSongs = useMemo(() => visibleSongEntries.map(({ song }) => song), [visibleSongEntries])
  const lastVisibleSongIndex = visibleSongEntries.at(-1)?.index ?? -1

  async function radioRequest(action, body = {}) {
    const response = await fetch(`/tesla-control/radio/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Navidrome-Username": auth.username, "X-Navidrome-Token": auth.subsonicToken, "X-Navidrome-Salt": auth.salt },
      body: JSON.stringify(body),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Smart Radio ist nicht erreichbar")
    return data
  }

  useEffect(() => {
    if (!menu || !auth.isAuthenticated) return undefined
    let cancelled = false
    setRadioInfo(null)
    radioRequest("info", { id: menu.song?.id }).then((data) => { if (!cancelled) setRadioInfo(data) }).catch(() => {})
    return () => { cancelled = true }
  }, [menu?.song?.id, menu?.type, auth.username])

  async function setRadioKind(kind) {
    try { setRadioInfo(await radioRequest("override", { id: menu.song.id, kind })); setStatus("Inhaltstyp für Smart Radio gespeichert.") }
    catch (err) { setStatus(err.message) }
  }

  useEffect(() => {
    localStorage.setItem(UI_SCALE_KEY, uiScale)
    const updateLayout = () => setLayout(viewportLayout(uiScaleFactor))
    updateLayout()
    window.addEventListener("resize", updateLayout)
    window.visualViewport?.addEventListener("resize", updateLayout)
    window.visualViewport?.addEventListener("scroll", updateLayout)
    return () => {
      window.removeEventListener("resize", updateLayout)
      window.visualViewport?.removeEventListener("resize", updateLayout)
      window.visualViewport?.removeEventListener("scroll", updateLayout)
    }
  }, [uiScale, uiScaleFactor])

  const scaledViewportStyle = {
    width: `${layout.width}px`,
    height: `${layout.height}px`,
    left: `${layout.left}px`,
    top: `${layout.top}px`,
    transform: `scale(${layout.scale})`,
  }

  const streamUrl = useMemo(() => {
    if (remotePairing || !currentSong || !canUseApi) return ""
    return subsonicUrl("stream", { id: currentSong.id }, auth)
  }, [auth, canUseApi, currentSong, remotePairing])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = playerVolume
    audio.muted = playerMuted
    localStorage.setItem(PLAYER_VOLUME_KEY, String(playerVolume))
    localStorage.setItem(PLAYER_VOLUME_VERSION_KEY, PLAYER_VOLUME_VERSION)
    localStorage.setItem(PLAYER_MUTED_KEY, String(playerMuted))
  }, [auth.isAuthenticated, playerMuted, playerVolume])

  const sendPlayerState = useCallback(() => {
    if (remotePairing) return
    const audio = audioRef.current
    playerControlRef.current?.send("state", {
      state: {
        playerName: playerDevice.name,
        username: auth.username,
        currentSong,
        queue: verlauf,
        currentIndex,
        isPlaying: audio ? !audio.paused : isPlaying,
        current: audio?.currentTime || 0,
        duration: audio?.duration || currentSong?.duration || 0,
        repeatMode,
        volume: playerVolume,
        muted: playerMuted,
        supportsVolume: true,
      },
    })
  }, [
    auth.username,
    currentIndex,
    currentSong,
    isPlaying,
    playerDevice.name,
    playerMuted,
    playerVolume,
    repeatMode,
    remotePairing,
    verlauf,
  ])

  playerStateSenderRef.current = sendPlayerState

  useEffect(() => {
    if (!playerDevice.enabled || !canUseApi) {
      playerControlRef.current?.close()
      playerControlRef.current = null
      setPlayerConnectionStatus(playerDevice.enabled ? "offline" : "disabled")
      return undefined
    }

    const connection = createControlConnection({
      hello: () => ({
        type: "hello",
        role: "player",
        device: {
          id: playerDevice.id,
          secret: playerDevice.secret,
          name: playerDevice.name,
        },
        auth: controlAuth(auth),
      }),
      onStatus: (connectionStatus, detail) => {
        setPlayerConnectionStatus(connectionStatus)
        setPlayerConnectionMessage(detail || "")
      },
      onMessage: (message) => {
        if (message.type === "authenticated") window.setTimeout(() => playerStateSenderRef.current(), 0)
        if (message.type === "pairing_code") {
          setPlayerPairingCode({ code: message.code, expiresAt: message.expiresAt })
        }
        if (message.type === "controllers") setPairedControllers(message.controllers || [])
        if (message.type === "state_requested") playerStateSenderRef.current()
        if (message.type === "command") remoteCommandHandlerRef.current(message.command, message.payload || {})
        if (message.type === "library_removed") remoteCommandHandlerRef.current("remove_deleted", { ids: message.ids })
      },
    })
    playerControlRef.current = connection
    return () => {
      connection.close()
      if (playerControlRef.current === connection) playerControlRef.current = null
    }
  }, [
    auth.salt,
    auth.subsonicToken,
    auth.username,
    canUseApi,
    playerDevice.enabled,
    playerDevice.id,
    playerDevice.name,
    playerDevice.secret,
  ])

  useEffect(() => {
    if (!playerDevice.enabled || playerConnectionStatus !== "connected") return
    sendPlayerState()
  }, [playerConnectionStatus, playerDevice.enabled, sendPlayerState])

  useEffect(() => {
    if (remotePairing || !playerDevice.enabled || playerConnectionStatus !== "connected") return undefined
    const timer = window.setInterval(() => {
      const audio = audioRef.current
      playerControlRef.current?.send("position", {
        current: audio?.currentTime || 0,
        duration: audio?.duration || currentSong?.duration || 0,
        isPlaying: audio ? !audio.paused : false,
        currentIndex,
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [currentIndex, currentSong?.duration, playerConnectionStatus, playerDevice.enabled, remotePairing])

  useEffect(() => {
    remoteControlRef.current?.close()
    remoteControlRef.current = null
    setRemotePlaybackState(null)
    setRemotePlayerOnline(false)
    if (!remotePairing || !canUseApi) return undefined

    const connection = createControlConnection({
      hello: () => ({
        type: "hello",
        role: "controller",
        pairing: remotePairing,
        auth: controlAuth(auth),
      }),
      onStatus: (connectionStatus, detail) => {
        setRemoteConnectionStatus(connectionStatus)
        setRemoteConnectionMessage(detail || "")
      },
      onMessage: (message) => {
        if (message.type === "authenticated") {
          setRemotePlayerOnline(Boolean(message.online))
          window.setTimeout(() => remoteControlRef.current?.send("get_state"), 0)
        }
        if (message.type === "player_status") setRemotePlayerOnline(Boolean(message.online))
        if (message.type === "state") setRemotePlaybackState(message.state || null)
        if (message.type === "position") {
          setRemotePlaybackState((state) =>
            state
              ? {
                  ...state,
                  current: message.current,
                  duration: message.duration || state.duration,
                  isPlaying: message.isPlaying,
                  currentIndex: message.currentIndex,
                }
              : state,
          )
        }
      },
    })
    remoteControlRef.current = connection
    return () => {
      connection.close()
      if (remoteControlRef.current === connection) remoteControlRef.current = null
    }
  }, [auth.salt, auth.subsonicToken, auth.username, canUseApi, remotePairing])

  const addRadioFuture = useCallback(
    async (mode, count = MIN_FUTURE) => {
      if (!canUseApi || randomRefillRunning.current) return []
      randomRefillRunning.current = true
      try {
        const heard = verlauf.slice(0, currentIndex + 1)
        const listened = heard.filter((song) => !radioSkippedRef.current.has(song.id)).slice(-5)
        const recent = listened.length ? listened : heard.slice(-1)
        const anchor = [...heard].reverse().find((song) => !song.radioGenerated && !radioSkippedRef.current.has(song.id)) || radioAnchorRef.current || recent[0]
        if (anchor) radioAnchorRef.current = { id: anchor.id }
        const data = await radioRequest("recommend", {
          mode, count: Math.min(3, count), minimumRating,
          recentIds: recent.map((song) => song.id), anchorId: anchor?.id,
          excludeIds: verlauf.slice(Math.max(0, currentIndex - 30)).map((song) => song.id),
          skipIds: [...radioSkippedRef.current].slice(-100),
        })
        const scope = radioScopeRef.current
        if (scope.username !== auth.username || scope.queue !== verlauf || scope.mode !== mode || scope.minimumRating !== minimumRating) return []
        const radioSongs = (data.songs || []).map((song) => ({ ...normalizeSong(song), radioGenerated: true }))
        if (radioSongs.length) {
          setVerlauf((items) => [...items, ...radioSongs])
          setStatus("Smart Radio: passende Songs ergänzt.")
        } else {
          setStatus(data.reason === "no_context" ? "Smart Radio: Ausgangstitel wird noch analysiert." : data.reason === "unknown_content" ? "Smart Radio: Inhaltstyp unklar. Bitte im Songmenü Musik oder Sprache festlegen." : "Smart Radio: keine weiteren passenden Songs gefunden.")
        }
        return radioSongs
      } catch (err) {
        setStatus(err.message)
        return []
      } finally {
        randomRefillRunning.current = false
      }
    },
    [auth, canUseApi, minimumRating, verlauf, currentIndex],
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
    if (audio.currentTime > 0.5 && audio.currentTime < (audio.duration || currentSong?.duration || Infinity) * 0.8) radioSkippedRef.current.add(songId)
    recordSkip(songId, audio.currentTime || 0, audio.duration || currentSong?.duration || playStartRef.current.duration)
    playStartRef.current = { songId: "", startedAt: 0, duration: 0 }
  }

  const restartCurrentSong = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    setTime((value) => ({ ...value, current: 0 }))
    audio.play().catch((err) => setStatus(err.message))
  }, [])

  const next = useCallback(async () => {
    if (remotePairing) return sendRemoteCommand("next")
    markCurrentSongSkip()
    if (currentIndex < 0 || !verlauf.length) return

    const futureCountBeforeSkip = verlauf.length - currentIndex - 1
    if (futureCountBeforeSkip > 0) {
      setCurrentIndex((idx) => idx + 1)
      if (RADIO_MODES.has(repeatMode) && futureCountBeforeSkip <= RADIO_LOOKAHEAD) {
        addRadioFuture(repeatMode, RADIO_LOOKAHEAD - futureCountBeforeSkip + 1)
      }
      return
    }

    if (repeatMode === "song") {
      restartCurrentSong()
      return
    }
    if (repeatMode === "playlist") {
      if (verlauf.length === 1) restartCurrentSong()
      else setCurrentIndex(0)
      return
    }
    if (RADIO_MODES.has(repeatMode)) {
      const added = await addRadioFuture(repeatMode, MIN_FUTURE)
      if (added.length) setCurrentIndex((idx) => idx + 1)
    }
  }, [addRadioFuture, currentIndex, currentSong, repeatMode, restartCurrentSong, verlauf.length, remotePairing])

  const continueAfterSongEnd = useCallback(async () => {
    if (currentIndex < 0 || !verlauf.length) return

    if (repeatMode === "song") {
      restartCurrentSong()
      return
    }
    if (currentIndex < verlauf.length - 1) {
      setCurrentIndex((idx) => idx + 1)
      return
    }
    if (repeatMode === "playlist") {
      if (verlauf.length === 1) restartCurrentSong()
      else setCurrentIndex(0)
      return
    }
    if (RADIO_MODES.has(repeatMode)) {
      const added = await addRadioFuture(repeatMode, MIN_FUTURE)
      if (added.length) {
        setCurrentIndex((idx) => idx + 1)
        return
      }
    }
    setIsPlaying(false)
  }, [addRadioFuture, currentIndex, repeatMode, restartCurrentSong, verlauf.length])

  const previous = useCallback(() => {
    if (remotePairing) return sendRemoteCommand("previous")
    const audio = audioRef.current
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      setTime((value) => ({ ...value, current: 0 }))
      return
    }
    markCurrentSongSkip()
    setCurrentIndex((idx) => Math.max(0, idx - 1))
  }, [currentSong, remotePairing])

  const togglePlayback = useCallback(async () => {
    if (remotePairing) return sendRemoteCommand("toggle")
    const audio = audioRef.current
    if (!audio) return
    if (!currentSong && visibleSongs.length) {
      insertAndPlay(visibleSongs[0])
      return
    }
    if (audio.paused) {
      await audio.play()
    } else {
      audio.pause()
    }
  }, [currentSong, visibleSongs, remotePairing])

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
    setMinimumRating(loadMinimumRating(auth.username))
    const nextSavedState = loadSavedState(auth.username)
    radioAnchorRef.current = nextSavedState?.radioAnchor || null
    radioSkippedRef.current = new Set()
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
    if (searchMode !== "search") return
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
  }, [auth, canUseApi, playlistView, query, searchMode])

  useEffect(() => {
    if (!canUseApi || didLoadInitialResultsRef.current || playlistView || query.trim()) return
    didLoadInitialResultsRef.current = true
    randomPlay()
  }, [canUseApi, playlistView, query])

  useEffect(() => {
    if (remotePairing) return
    if (currentIndex <= MAX_HISTORY || verlauf.length <= MAX_HISTORY + MIN_FUTURE) return
    const drop = currentIndex - MAX_HISTORY
    setVerlauf((items) => items.slice(drop))
    setCurrentIndex((idx) => idx - drop)
  }, [currentIndex, verlauf.length, remotePairing])

  useEffect(() => {
    if (!auth.username || remotePairing) return
    saveState({
      verlauf,
      currentIndex,
      position: audioRef.current?.currentTime || time.current || 0,
      wasPlaying: isPlaying,
      username: auth.username,
      radioAnchor: radioAnchorRef.current,
    })
  }, [auth.username, currentIndex, isPlaying, time.current, verlauf, remotePairing])

  useEffect(() => {
    if (window.matchMedia(MOBILE_LAYOUT_QUERY).matches && activeContentPane !== "queue") return
    currentRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [activeContentPane, currentIndex])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem(REPEAT_MODE_KEY, localRepeatMode)
  }, [localRepeatMode])

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
    const onEnded = () => { if (currentSong?.id) radioSkippedRef.current.delete(currentSong.id); continueAfterSongEnd() }
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
  }, [continueAfterSongEnd, currentSong?.duration, currentSong?.id])

  useEffect(() => {
    const previousSong = playStartRef.current
    if (remotePairing) return
    if (!previousSong.songId || previousSong.songId === currentSong?.id) return
    recordSkip(previousSong.songId, time.current, time.duration || previousSong.duration)
    playStartRef.current = { songId: "", startedAt: 0, duration: 0 }
  }, [currentSong?.id])

  useEffect(() => {
    if (remotePairing) {
      if (!wasRemoteRef.current) localPositionRef.current = audioRef.current?.currentTime || 0
      wasRemoteRef.current = true
      audioRef.current?.pause()
      playStartRef.current = { songId: "", startedAt: 0, duration: 0 }
      return
    }
    if (!audioRef.current) return
    if (!streamUrl) { audioRef.current.pause(); audioRef.current.removeAttribute("src"); return }
    if (wasRemoteRef.current) {
      wasRemoteRef.current = false
      pendingSeekRef.current = localPositionRef.current
      audioRef.current.src = streamUrl
      return
    }
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
  }, [currentSong?.id, savedState, streamUrl, remotePairing])

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
    setHandler("play", togglePlayback)
    setHandler("pause", togglePlayback)
    setHandler("previoustrack", previous)
    setHandler("nexttrack", next)
  }, [currentSong, next, previous, togglePlayback])

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
    if (remotePairing) return sendRemoteCommand("queue_song", { song, mode: "play" })
    markCurrentSongSkip()
    setVerlauf((items) => {
      const index = currentIndex >= 0 ? currentIndex : -1
      return [...items.slice(0, index + 1), { ...song, radioGenerated: false }, ...items.slice(index + 1)]
    })
    setCurrentIndex((idx) => idx + 1)
  }

  function addToVerlauf(song) {
    if (remotePairing) return sendRemoteCommand("queue_song", { song, mode: "append" })
    setVerlauf((items) => {
      const nextItems = [...items, song]
      if (currentIndex < 0) setCurrentIndex(0)
      return nextItems
    })
    setStatus(`Zum Verlauf hinzugefuegt: ${song.title}`)
  }

  function insertAfterCurrent(song) {
    if (remotePairing) return sendRemoteCommand("queue_song", { song, mode: "next" })
    setVerlauf((items) => {
      const index = currentIndex >= 0 ? currentIndex : -1
      return [...items.slice(0, index + 1), song, ...items.slice(index + 1)]
    })
    if (currentIndex < 0) setCurrentIndex(0)
    setStatus(`Nach aktuellem Song eingefuegt: ${song.title}`)
  }

  function playAllResults() {
    if (remotePairing) { sendRemoteCommand("queue_batch", { songs: visibleSongs, mode: "play" }); setMenu(null); return }
    if (!visibleSongs.length) return
    markCurrentSongSkip()
    setVerlauf((items) => [...items.slice(0, currentIndex + 1), ...visibleSongs])
    setCurrentIndex((idx) => (idx < 0 ? 0 : idx + 1))
    setMenu(null)
  }

  function insertAllResults() {
    if (remotePairing) { sendRemoteCommand("queue_batch", { songs: visibleSongs, mode: "insert" }); setMenu(null); return }
    if (!visibleSongs.length) return
    setVerlauf((items) => [...items.slice(0, currentIndex + 1), ...visibleSongs, ...items.slice(currentIndex + 1)])
    if (currentIndex < 0) setCurrentIndex(0)
    setMenu(null)
  }

  function appendAllResults() {
    if (remotePairing) { sendRemoteCommand("queue_batch", { songs: visibleSongs, mode: "append" }); setMenu(null); return }
    if (!visibleSongs.length) return
    setVerlauf((items) => [...items, ...visibleSongs])
    if (currentIndex < 0) setCurrentIndex(0)
    setMenu(null)
  }

  function replaceVerlaufWithResults() {
    if (remotePairing) { sendRemoteCommand("queue_batch", { songs: visibleSongs, mode: "replace" }); setMenu(null); return }
    if (!visibleSongs.length) return
    markCurrentSongSkip()
    setVerlauf(visibleSongs)
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

  async function setSongRating(song, rating) {
    if (!song?.id || !canUseApi) return
    const nextRating = Math.max(0, Math.min(5, Number(rating || 0)))
    try {
      await subsonic("setRating", { id: song.id, rating: nextRating }, auth)
      const update = (item) => (item.id === song.id ? { ...item, userRating: nextRating } : item)
      setSongs((items) => items.map(update))
      setVerlauf((items) => items.map(update))
      setPlaylistView((view) =>
        view?.previousSongs ? { ...view, previousSongs: view.previousSongs.map(update) } : view,
      )
      setMenu((currentMenu) =>
        currentMenu?.song?.id === song.id
          ? { ...currentMenu, song: { ...currentMenu.song, userRating: nextRating } }
          : currentMenu,
      )
      setStatus(nextRating > 0 ? `${nextRating} Sterne: ${song.title}` : `Bewertung entfernt: ${song.title}`)
    } catch (err) {
      setStatus(err.message)
    }
  }

  function changeMinimumRating(value) {
    const nextValue = Number(value)
    if (!RATING_FILTER_OPTIONS.some((option) => option.value === nextValue)) return
    setMinimumRating(nextValue)
    localStorage.setItem(ratingFilterStorageKey(auth.username), String(nextValue))
  }

  async function randomPlay() {
    try {
      setStatus("Lade zufaellige Songs...")
      const requestSize = minimumRating > 0 ? 300 : 30
      const data = await subsonic("getRandomSongs", { size: requestSize }, auth)
      const randomSongs = pickRandomSongs(
        (data.randomSongs?.song || [])
          .map(normalizeSong)
          .filter((song) => songMatchesMinimumRating(song, minimumRating)),
        30,
      )
      setSongs(randomSongs)
      setPlaylistResults([])
      setAlbumResults([])
      setArtistResults([])
      setPlaylistView(null)
      setResultTitle("Zufall")
      setStatus(
        minimumRating > 0 && !randomSongs.length
          ? `Keine Songs mit mindestens ${minimumRating} Sternen gefunden.`
          : "",
      )
    } catch (err) {
      setStatus(err.message)
    }
  }

  function cycleRepeatMode() {
    if (remotePairing) return sendRemoteCommand("set_repeat", { mode: REPEAT_MODES[(REPEAT_MODES.indexOf(repeatMode) + 1) % REPEAT_MODES.length] })
    setRepeatMode((currentMode) => {
      const currentModeIndex = REPEAT_MODES.indexOf(currentMode)
      return REPEAT_MODES[(currentModeIndex + 1) % REPEAT_MODES.length]
    })
  }

  function changePlayerDevice(updates) {
    setPlayerDevice((current) => {
      const nextDevice = { ...current, ...updates }
      savePlayerDevice(nextDevice)
      if (!nextDevice.enabled) setPlayerPairingCode(null)
      return nextDevice
    })
  }

  function requestPlayerPairingCode() {
    if (!playerControlRef.current?.send("create_pairing_code")) {
      setPlayerConnectionMessage("Player ist noch nicht verbunden.")
    }
  }

  function revokeController(controllerId) {
    playerControlRef.current?.send("revoke_controller", { controllerId })
  }

  function pairWithPlayer(code) {
    const normalizedCode = String(code || "").replace(/\D/g, "").slice(0, 6)
    if (normalizedCode.length !== 6) {
      setPairingStatus("Bitte den sechsstelligen Code eingeben.")
      return
    }
    const controller = loadControllerDevice()
    setPairingStatus("Kopple Gerät …")
    let connection
    connection = createControlConnection({
      reconnect: false,
      hello: {
        type: "hello",
        role: "pair",
        code: normalizedCode,
        controller: {
          id: controller.id,
          name: auth.name || auth.username || "Fernbedienung",
        },
        auth: controlAuth(auth),
      },
      onMessage: (message) => {
        if (message.type === "paired") {
          const nextPairing = message.pairing
          setControlPairings((current) => {
            const next = [nextPairing, ...current.filter((item) => item.playerId !== nextPairing.playerId)]
            saveControlPairings(next)
            return next
          })
          setPairingStatus(`${nextPairing.playerName} wurde gekoppelt.`)
          selectRemotePlayer(nextPairing)
          connection?.close()
        }
        if (message.type === "error") setPairingStatus(message.message || "Kopplung fehlgeschlagen.")
      },
      onStatus: (connectionStatus, detail) => {
        if (connectionStatus === "error" && detail) setPairingStatus(detail)
      },
    })
  }

  function forgetControlPairing(playerId) {
    setControlPairings((current) => {
      const next = current.filter((pairing) => pairing.playerId !== playerId)
      saveControlPairings(next)
      return next
    })
    if (remotePairing?.playerId === playerId) setRemotePairing(null)
  }

  function sendRemoteCommand(command, payload = {}) {
    if (!remotePlayerOnline || remoteConnectionStatus !== "connected" || !remoteControlRef.current?.send("command", { command, payload })) {
      setStatus("Fernsteuerung: Player ist nicht verbunden.")
    }
  }

  async function libraryRequest(action, body = {}) {
    const response = await fetch(`/tesla-control/library/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Navidrome-Username": auth.username, "X-Navidrome-Token": auth.subsonicToken, "X-Navidrome-Salt": auth.salt },
      body: JSON.stringify(body),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || "Vorgang fehlgeschlagen")
    return result
  }

  async function markDuplicate(song, remove = false) {
    try {
      const result = await libraryRequest("mark", { song, remove })
      if (duplicateSongs) setDuplicateSongs(result.songs)
      setStatus(remove ? "Markierung entfernt" : `Als Duplikat markiert: ${song.title}`)
      setMenu(null)
    } catch (err) { setStatus(err.message) }
  }

  async function showDuplicateSongs() {
    try { const result = await libraryRequest("marks"); setDuplicateSongs(result.songs); setMenu(null) }
    catch (err) { setStatus(err.message) }
  }

  async function prepareDelete(ids) {
    try { setDeletePreview(await libraryRequest("delete-preview", { ids })); setMenu(null) }
    catch (err) { setStatus(err.message) }
  }

  async function confirmDelete() {
    setDeleteBusy(true)
    try {
      const result = await libraryRequest("delete", { token: deletePreview.token })
      const removed = new Set(result.removed)
      setSongs((items) => items.filter((song) => !removed.has(song.id)))
      setDuplicateSongs((items) => items?.filter((song) => !removed.has(song.id)) ?? null)
      // Keep the local queue index aligned after removing songs before the current title.
      setVerlauf((items) => items.filter((song) => !removed.has(song.id)))
      setCurrentIndex((index) => index < 0 ? index : Math.min(localVerlauf.filter((song, i) => i < index && !removed.has(song.id)).length, localVerlauf.filter((song) => !removed.has(song.id)).length - 1))
      setDeletePreview(null)
      setStatus(`${result.removed.length} Songs aus der Bibliothek entfernt.`)
    } catch (err) { setStatus(err.message); setDeletePreview(null) }
    finally { setDeleteBusy(false) }
  }

  function selectRemotePlayer(pairing) {
    if (pairing.playerId === playerDevice.id) { setStatus("Dieses Gerät ist bereits der lokale Player."); return }
    localStorage.setItem("teslaNavidromeLastRemotePlayer", pairing.playerId)
    setRemotePairing(pairing)
    setShowDevices(false)
  }

  function toggleRemotePlayer() {
    if (devicePressRef.current.held) { devicePressRef.current.held = false; return }
    if (remotePairing) { setRemotePairing(null); return }
    const lastId = localStorage.getItem("teslaNavidromeLastRemotePlayer")
    const pairing = controlPairings.find((item) => item.playerId === lastId) || controlPairings[0]
    if (pairing) selectRemotePlayer(pairing)
    else setShowDevices(true)
  }

  function downloadSong(song) {
    if (!song?.id || !canUseApi) return
    const link = document.createElement("a")
    link.href = subsonicUrl("download", { id: song.id }, auth)
    link.download = ""
    link.hidden = true
    document.body.appendChild(link)
    link.click()
    link.remove()
    setStatus(`Download gestartet: ${song.title}`)
    setMenu(null)
  }

  function trackContentPane() {
    if (!window.matchMedia(MOBILE_LAYOUT_QUERY).matches) return
    const content = contentRef.current
    const resultsPane = resultsPaneRef.current
    const queuePane = queuePaneRef.current
    if (!content || !resultsPane || !queuePane) return
    const contentLeft = content.getBoundingClientRect().left
    const resultsDistance = Math.abs(resultsPane.getBoundingClientRect().left - contentLeft)
    const queueDistance = Math.abs(queuePane.getBoundingClientRect().left - contentLeft)
    setActiveContentPane(queueDistance < resultsDistance ? "queue" : "results")
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
    if (remotePairing) { sendRemoteCommand("remove_queue_item", { index }); setMenu(null); return }
    setVerlauf((items) => items.filter((_, itemIndex) => itemIndex !== index))
    setCurrentIndex((idx) => {
      if (index < idx) return idx - 1
      if (index === idx) return Math.min(idx, Math.max(0, verlauf.length - 2))
      return idx
    })
    setMenu(null)
  }

  function removePastSongs() {
    if (remotePairing) { sendRemoteCommand("remove_past"); setMenu(null); return }
    if (currentIndex <= 0) return
    setVerlauf((items) => items.slice(currentIndex))
    setCurrentIndex(0)
    setMenu(null)
  }

  function removeFutureSongs() {
    if (remotePairing) { sendRemoteCommand("remove_future"); setMenu(null); return }
    if (currentIndex < 0) return
    setVerlauf((items) => items.slice(0, currentIndex + 1))
    setMenu(null)
  }

  function removeDislikedSongs() {
    if (remotePairing) { sendRemoteCommand("remove_disliked"); setMenu(null); return }
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
    if (remotePairing) return sendRemoteCommand("move_queue_item", { fromIndex, toIndex })
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
    return Number(rows.at(-1)?.dataset.index || -1) + 1
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
    if (remotePairing) { sendRemoteCommand("clear_queue"); setMenu(null); return }
    setMenu(null)
    const requestSize = minimumRating > 0 ? Math.min(500, MIN_FUTURE * 10) : MIN_FUTURE
    subsonic("getRandomSongs", { size: requestSize }, auth)
      .then((data) => {
        const randomSongs = pickRandomSongs(
          (data.randomSongs?.song || [])
            .map(normalizeSong)
            .filter((song) => songMatchesMinimumRating(song, minimumRating)),
          MIN_FUTURE,
        )
        setVerlauf(randomSongs)
        setCurrentIndex(randomSongs.length ? 0 : -1)
        if (!randomSongs.length && minimumRating > 0) {
          setStatus(`Keine Songs mit mindestens ${minimumRating} Sternen gefunden.`)
        }
      })
      .catch((err) => setStatus(err.message))
  }

  function shuffleVerlauf() {
    if (remotePairing) { sendRemoteCommand("shuffle_queue"); setMenu(null); return }
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
    const nextProfiles = removeUserProfile(auth.username)
    audioRef.current?.pause()
    clearAuth()
    setUserProfiles(nextProfiles)
    if (nextProfiles.length) {
      activateUserProfile(nextProfiles[0])
      setAuth(authState())
      setMenu({ type: "user" })
      return
    }
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
    setAuth(emptyAuthState())
    setMenu(null)
  }

  remoteCommandHandlerRef.current = (command, payload) => {
    if (remotePairing) return
    const audio = audioRef.current
    if (command === "play") audio?.play().catch((err) => setStatus(`Fernsteuerung: ${err.message}`))
    if (command === "pause") audio?.pause()
    if (command === "toggle") togglePlayback()
    if (command === "next") next()
    if (command === "previous") previous()
    if (command === "seek" && audio) {
      const position = Number(payload.position)
      if (Number.isFinite(position)) audio.currentTime = Math.max(0, Math.min(position, audio.duration || position))
    }
    if (command === "set_volume") {
      const volume = Number(payload.volume)
      if (Number.isFinite(volume)) {
        setPlayerVolume(Math.max(0, Math.min(1, volume)))
        if (volume > 0) setPlayerMuted(false)
      }
    }
    if (command === "set_muted") setPlayerMuted(Boolean(payload.muted))
    if (command === "set_repeat" && REPEAT_MODES.includes(payload.mode)) setRepeatMode(payload.mode)
    if (command === "play_index") {
      const index = Number(payload.index)
      if (Number.isInteger(index) && index >= 0 && index < verlauf.length) {
        setVerlauf((items) => items.map((song, itemIndex) => itemIndex === index ? { ...song, radioGenerated: false } : song))
        if (index !== currentIndex) markCurrentSongSkip()
        setCurrentIndex(index)
      }
    }
    if (command === "remove_queue_item") {
      const index = Number(payload.index)
      if (Number.isInteger(index) && index >= 0 && index < verlauf.length) removeFromVerlauf(index)
    }
    if (command === "move_queue_item") {
      const fromIndex = Number(payload.fromIndex)
      const toIndex = Number(payload.toIndex)
      if (Number.isInteger(fromIndex) && Number.isInteger(toIndex)) moveVerlaufItem(fromIndex, toIndex)
    }
    if (command === "queue_song" && payload.song?.id) {
      const song = normalizeSong(payload.song)
      if (payload.mode === "play") insertAndPlay(song)
      else if (payload.mode === "next") insertAfterCurrent(song)
      else addToVerlauf(song)
    }
    if (command === "queue_batch" && Array.isArray(payload.songs)) {
      const additions = payload.songs.filter((song) => song?.id).slice(0, 500).map(normalizeSong)
      if (!additions.length) return
      if (payload.mode === "replace") { setVerlauf(additions); setCurrentIndex(0) }
      else if (payload.mode === "append") { setVerlauf((items) => [...items, ...additions]); if (currentIndex < 0) setCurrentIndex(0) }
      else {
        setVerlauf((items) => [...items.slice(0, currentIndex + 1), ...additions, ...(payload.mode === "play" ? [] : items.slice(currentIndex + 1))])
        if (payload.mode === "play" || currentIndex < 0) setCurrentIndex(currentIndex + 1)
      }
    }
    if (command === "remove_past") removePastSongs()
    if (command === "remove_future") removeFutureSongs()
    if (command === "shuffle_queue") shuffleVerlauf()
    if (command === "clear_queue") clearVerlauf()
    if (command === "remove_disliked") removeDislikedSongs()
    if (command === "remove_deleted" && Array.isArray(payload.ids)) {
      const removed = new Set(payload.ids)
      setVerlauf((items) => items.filter((song) => !removed.has(song.id)))
      setCurrentIndex(Math.min(verlauf.filter((song, index) => index < currentIndex && !removed.has(song.id)).length, verlauf.filter((song) => !removed.has(song.id)).length - 1))
    }
  }

  if (!auth.isAuthenticated || !canUseApi) {
    return (
      <main className="loginScreen scaledViewport" style={scaledViewportStyle}>
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
          <p className="status">{status || "Mit einem Navidrome-Benutzer anmelden."}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app scaledViewport" style={scaledViewportStyle}>
      <audio ref={audioRef} preload="auto" />
      {dragState?.song && (
        <div
          className="dragGhost"
          style={{
            left: `${Math.max(8, Math.min((dragState.x + 18) / layout.scale, layout.width - 390))}px`,
            top: `${Math.max(8, Math.min((dragState.y + 18) / layout.scale, layout.height - 90))}px`,
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
          <div className="nowPlayingHeader">
            <div className="songDetails">
              <strong>{currentSong?.title || "Bereit"}</strong>
              <span>{currentSong ? `${currentSong.artist} - ${currentSong.album}` : `Angemeldet als ${auth.name}`}</span>
            </div>
            <div className="clock">
              {formatTime(time.current)} / {formatTime(time.duration || currentSong?.duration || 0)}
            </div>
          </div>
          <input
            className="progress"
            type="range"
            min="0"
            max={Math.max(1, time.duration || currentSong?.duration || 1)}
            value={Math.min(time.current, time.duration || currentSong?.duration || 1)}
            onChange={(event) => {
              if (remotePairing) sendRemoteCommand("seek", { position: Number(event.target.value) })
              else if (audioRef.current) audioRef.current.currentTime = Number(event.target.value)
            }}
          />
        </div>
        <button className={currentSong?.starred ? "likeNow liked" : "likeNow"} type="button" onClick={toggleStar}>
          <Heart size={28} fill={currentSong?.starred ? "currentColor" : "none"} />
          Like
        </button>
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
        <button
          className="repeatModeButton"
          type="button"
          onClick={cycleRepeatMode}
          aria-label={`Wiedergabemodus: ${REPEAT_MODE_LABELS[repeatMode]}`}
          title={REPEAT_MODE_LABELS[repeatMode]}
        >
          <RepeatModeIcon mode={repeatMode} />
        </button>
        <button
          className={`deviceButton ${remotePairing ? `connected ${remotePlayerOnline && remoteConnectionStatus === "connected" ? "remoteControlActive" : "remoteControlUnavailable"}` : ""}`}
          type="button"
          onClick={toggleRemotePlayer}
          onPointerDown={() => {
            devicePressRef.current.held = false
            devicePressRef.current.timer = window.setTimeout(() => { devicePressRef.current.held = true; setShowDevices(true) }, 550)
          }}
          onPointerUp={() => window.clearTimeout(devicePressRef.current.timer)}
          onPointerCancel={() => window.clearTimeout(devicePressRef.current.timer)}
          onPointerLeave={() => window.clearTimeout(devicePressRef.current.timer)}
          onContextMenu={(event) => { event.preventDefault(); window.clearTimeout(devicePressRef.current.timer); devicePressRef.current.held = true; setShowDevices(true) }}
          aria-pressed={Boolean(remotePairing)}
          aria-label={remotePairing ? `Fernsteuerung ${remotePairing.playerName} ausschalten` : "Fernsteuerung einschalten"}
          title={remotePairing ? `Fernsteuerung: ${remotePairing.playerName} · Lang drücken: Gerätewahl` : "Fernsteuerung · Lang drücken: Gerätewahl"}
        >
          <Cast size={28} />
        </button>
        <div className="userButtonSlot">
          <button className="secondaryButton userButton" type="button" onClick={() => setMenu({ type: "user" })}>
            {auth.username || auth.name}
          </button>
        </div>
      </section>

      {remotePairing && <div className={`remoteVolumeInline ${remotePlayerOnline && remoteConnectionStatus === "connected" ? "remoteControlActive" : "remoteControlUnavailable"}`}>
        <span>{remotePairing.playerName}: {remotePlayerOnline && remoteConnectionStatus === "connected" ? "Fernsteuerung aktiv" : "Nicht verbunden"}</span>
        <button type="button" aria-label="Stummschaltung" onClick={() => sendRemoteCommand("set_muted", { muted: !remotePlaybackState?.muted })}>{remotePlaybackState?.muted ? <VolumeX size={22} /> : <Volume2 size={22} />}</button>
        <input aria-label="Playerlautstärke" type="range" min="0" max="100" value={Math.round(volumeToSlider(remotePlaybackState?.volume ?? 1))} onChange={(event) => sendRemoteCommand("set_volume", { volume: sliderToVolume(event.target.value) })} />
      </div>}

      <section className="content" ref={contentRef} onScroll={trackContentPane}>
        <div className="results" ref={resultsPaneRef}>
          <button
            className="sectionHeader buttonHeader"
            type="button"
            disabled={!visibleSongs.length && !playlistResults.length && !albumResults.length && !artistResults.length}
            onClick={() => setMenu({ type: "results" })}
          >
            <h2>{resultTitle}</h2>
            <span>
              {status ||
                `${visibleSongs.length} Songs / ${albumResults.length} Alben / ${artistResults.length} Künstler / ${playlistResults.length} Playlists`}
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
            {visibleSongEntries.map(({ song, index }) => (
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
                    : isEditablePlaylist &&
                        dragState?.type === "playlist" &&
                        dragState.insertIndex === lastVisibleSongIndex + 1 &&
                        index === lastVisibleSongIndex
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

        <aside className="verlauf" ref={queuePaneRef}
          onDragOver={(event) => { if (event.dataTransfer.types.includes("application/x-navidrome-song")) event.preventDefault() }}
          onDrop={(event) => {
            const data = event.dataTransfer.getData("application/x-navidrome-song")
            if (!data) return
            event.preventDefault()
            try { const song = JSON.parse(data); if (song.id) addToVerlauf(song) } catch { /* Ignore unrelated drops. */ }
          }}>
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
                  if (remotePairing) return sendRemoteCommand("play_index", { index })
                  setVerlauf((items) => items.map((song, itemIndex) => itemIndex === index ? { ...song, radioGenerated: false } : song))
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
          onRate={(rating) => setSongRating(menu.song, rating)}
          radioInfo={radioInfo}
          onRadioKindChange={setRadioKind}
          onDownload={() => downloadSong(menu.song)}
          canManageLibrary={auth.role === "admin"}
          onMarkDuplicate={() => markDuplicate(menu.song)}
          onDeleteSong={() => prepareDelete([menu.song.id])}
          onShowDuplicates={showDuplicateSongs}
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
          uiScale={uiScale}
          onUiScaleChange={setUiScale}
          minimumRating={minimumRating}
          onMinimumRatingChange={changeMinimumRating}
          canUploadMusic={canUploadMusic}
          onOpenUpload={() => {
            setMenu(null)
            setShowUpload(true)
          }}
        />
      )}
      {showUpload && canUploadMusic && <UploadDialog auth={auth} onClose={() => setShowUpload(false)} />}
      {duplicateSongs && !deletePreview && (
        <div className="modalBackdrop"><section className="actionSheet">
          <header><h2>Markierte Duplikate</h2><button onClick={() => setDuplicateSongs(null)}>Schließen</button></header>
          {duplicateSongs.length === 0 && <p>Keine Songs markiert.</p>}
          {duplicateSongs.map((song) => <div className="pairedDevice" key={song.id}><span><strong>{song.title}</strong><small>{song.artist}</small></span><button onClick={() => markDuplicate(song, true)} aria-label="Markierung entfernen"><X /></button></div>)}
          <button disabled={!duplicateSongs.length} onClick={() => prepareDelete(duplicateSongs.map((song) => song.id))}>Duplikate vom Server löschen</button>
        </section></div>
      )}
      {deletePreview && <DeleteSongsDialog preview={deletePreview} busy={deleteBusy} onConfirm={confirmDelete} onClose={() => setDeletePreview(null)} />}
      {showDevices && (
        <DevicesDialog
          auth={auth}
          playerDevice={playerDevice}
          playerConnectionStatus={playerConnectionStatus}
          playerConnectionMessage={playerConnectionMessage}
          playerPairingCode={playerPairingCode}
          pairedControllers={pairedControllers}
          onChangePlayerDevice={changePlayerDevice}
          onRequestPairingCode={requestPlayerPairingCode}
          onRevokeController={revokeController}
          controlPairings={controlPairings}
          pairingStatus={pairingStatus}
          onPair={pairWithPlayer}
          onForgetPairing={forgetControlPairing}
          remotePairing={remotePairing}
          onSelectRemote={selectRemotePlayer}
          remoteConnectionStatus={remoteConnectionStatus}
          remoteConnectionMessage={remoteConnectionMessage}
          remotePlayerOnline={remotePlayerOnline}
          remotePlaybackState={remotePlaybackState}
          onRemoteCommand={sendRemoteCommand}
          onClose={() => {
            setShowDevices(false)
          }}
        />
      )}
    </main>
  )
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0)
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

function DeleteSongsDialog({ preview, busy, onConfirm, onClose }) {
  const trackRef = useRef(null)
  const gestureRef = useRef(null)
  const [progress, setProgress] = useState(0)
  const [confirmed, setConfirmed] = useState(false)
  return <div className="modalBackdrop"><section className="actionSheet">
    <header><h2>Vom Server löschen</h2><button disabled={busy} onClick={onClose}>Abbrechen</button></header>
    <p>Diese {preview.files.length} Songs werden aus der Bibliothek entfernt. Der Papierkorb wird nach drei Monaten endgültig geleert.</p>
    {preview.files.map((song) => <p key={song.id}><strong>{song.title}</strong> · {song.artist}</p>)}
    <div className="deleteSwipe" ref={trackRef}>
      <span>{busy ? "Wird gelöscht …" : "Pfeil zum Löschen ganz nach rechts ziehen"}</span>
      <button type="button" aria-label="Zum Löschen nach rechts ziehen" disabled={busy || confirmed}
        style={{ left: `calc(${progress * 100}% - ${progress * 64}px)` }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          gestureRef.current = { start: event.clientX, distance: Math.max(1, trackRef.current.getBoundingClientRect().width - event.currentTarget.getBoundingClientRect().width) }
        }}
        onPointerMove={(event) => { if (gestureRef.current) setProgress(Math.max(0, Math.min(1, (event.clientX - gestureRef.current.start) / gestureRef.current.distance))) }}
        onPointerCancel={() => { gestureRef.current = null; setProgress(0) }}
        onPointerUp={(event) => {
          const gesture = gestureRef.current
          gestureRef.current = null
          if (gesture && (event.clientX - gesture.start) / gesture.distance >= 0.97) { setConfirmed(true); onConfirm() }
          else setProgress(0)
        }}>→</button>
    </div>
  </section></div>
}

function analyzeAudioFiles(files, auth, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    const formData = new FormData()
    files.forEach((file) => formData.append("files", file, file.name))
    request.open("POST", "/tesla-control/upload/analyze")
    request.setRequestHeader("X-Navidrome-Username", auth.username)
    request.setRequestHeader("X-Navidrome-Token", auth.subsonicToken)
    request.setRequestHeader("X-Navidrome-Salt", auth.salt)
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100))
    })
    request.addEventListener("load", () => {
      let data
      try {
        data = JSON.parse(request.responseText || "{}")
      } catch {
        reject(new Error("Der Upload-Dienst hat ungültig geantwortet."))
        return
      }
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(data.error || data.errors?.join(" ") || "Upload fehlgeschlagen."))
        return
      }
      resolve(data)
    })
    request.addEventListener("error", () => reject(new Error("Upload-Dienst nicht erreichbar.")))
    request.addEventListener("abort", () => reject(new Error("Upload wurde abgebrochen.")))
    request.send(formData)
  })
}

function UploadDialog({ auth, onClose }) {
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)
  const [uploads, setUploads] = useState([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [status, setStatus] = useState("")
  const [errors, setErrors] = useState([])
  const [importResults, setImportResults] = useState({})
  const [isDragging, setIsDragging] = useState(false)

  async function addFiles(fileList) {
    if (isUploading || isImporting) return
    const files = [...fileList].filter((file) => file.size > 0)
    if (!files.length) return
    setIsUploading(true)
    setUploadProgress(0)
    setStatus(`Lade ${files.length} ${files.length === 1 ? "Datei" : "Dateien"} hoch …`)
    setErrors([])
    try {
      const result = await analyzeAudioFiles(files, auth, setUploadProgress)
      setUploads((current) => {
        const seen = new Set(current.map((item) => item.fingerprint))
        const additions = (result.files || []).map((item) => {
          const duplicateInBatch = seen.has(item.fingerprint)
          seen.add(item.fingerprint)
          return { ...item, duplicateInBatch }
        })
        return [...current, ...additions]
      })
      setErrors(result.errors || [])
      setStatus(`${result.files?.length || 0} ${result.files?.length === 1 ? "Datei analysiert" : "Dateien analysiert"}.`)
    } catch (uploadError) {
      setStatus(uploadError.message)
    } finally {
      setIsUploading(false)
    }
  }

  function updateMetadata(uploadId, field, value) {
    setUploads((current) =>
      current.map((upload) =>
        upload.id === uploadId
          ? {
              ...upload,
              metadata: {
                ...upload.metadata,
                [field]: ["track", "disc", "year"].includes(field) ? Math.max(0, Number(value || 0)) : value,
              },
            }
          : upload,
      ),
    )
  }

  async function removeUpload(upload) {
    try {
      if (!["imported", "duplicate"].includes(importResults[upload.id]?.status)) {
        const response = await fetch("/tesla-control/upload/remove", {
          method: "POST", headers: { "Content-Type": "application/json", "X-Navidrome-Username": auth.username, "X-Navidrome-Token": auth.subsonicToken, "X-Navidrome-Salt": auth.salt },
          body: JSON.stringify({ id: upload.id }),
        })
        if (!response.ok) throw new Error("Datei konnte nicht entfernt werden")
      }
      setUploads((items) => {
        const seen = new Set()
        return items.filter((item) => item.id !== upload.id).map((item) => {
          const duplicateInBatch = seen.has(item.fingerprint)
          seen.add(item.fingerprint)
          return { ...item, duplicateInBatch }
        })
      })
    } catch (err) { setStatus(err.message) }
  }

  async function importFiles() {
    const pendingUploads = uploads.filter((upload) => !upload.duplicate && !upload.duplicateInBatch && !["imported", "duplicate"].includes(importResults[upload.id]?.status))
    if (!pendingUploads.length) return
    setIsImporting(true)
    setStatus("Importiere Musik …")
    try {
      const response = await fetch("/tesla-control/upload/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Navidrome-Username": auth.username,
          "X-Navidrome-Token": auth.subsonicToken,
          "X-Navidrome-Salt": auth.salt,
        },
        body: JSON.stringify({
          files: pendingUploads.map((upload) => ({ id: upload.id, metadata: upload.metadata })),
        }),
      })
      const result = await response.json()
      if (!response.ok && response.status !== 207) throw new Error(result.error || "Import fehlgeschlagen.")
      setImportResults((current) => ({
        ...current,
        ...Object.fromEntries((result.results || []).map((item) => [item.id, item])),
      }))
      const failed = (result.results || []).filter((item) => item.status === "error").length
      setStatus(failed ? `${failed} Dateien konnten nicht importiert werden.` : "Import abgeschlossen. Navidrome liest die neuen Songs ein.")
    } catch (importError) {
      setStatus(importError.message)
    } finally {
      setIsImporting(false)
    }
  }

  function handleDrop(event) {
    event.preventDefault()
    setIsDragging(false)
    addFiles(event.dataTransfer.files)
  }

  return (
    <div className="modalBackdrop uploadBackdrop">
      <section className="actionSheet uploadSheet" onClick={(event) => event.stopPropagation()}>
        <header>
          <h2>Musik hochladen</h2>
          <button type="button" onClick={onClose} disabled={isUploading || isImporting}>Schließen</button>
        </header>

        <div
          className={`uploadDropZone ${isDragging ? "dragging" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false)
          }}
          onDrop={handleDrop}
        >
          <Upload size={54} />
          <strong>Audiodateien hierher ziehen</strong>
          <span>MP3, FLAC, M4A, AAC, OGG, Opus, WAV, WMA und WavPack</span>
          <div className="uploadPickerButtons">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>Dateien wählen</button>
            <button type="button" onClick={() => folderInputRef.current?.click()} disabled={isUploading}>Ordner wählen</button>
          </div>
          <input
            className="hiddenFileInput"
            ref={fileInputRef}
            type="file"
            accept="audio/*,.flac,.wv"
            multiple
            onChange={(event) => {
              addFiles(event.target.files)
              event.target.value = ""
            }}
          />
          <input
            className="hiddenFileInput"
            ref={folderInputRef}
            type="file"
            accept="audio/*,.flac,.wv"
            multiple
            webkitdirectory=""
            onChange={(event) => {
              addFiles(event.target.files)
              event.target.value = ""
            }}
          />
        </div>

        {isUploading && (
          <div className="uploadProgress">
            <progress max="100" value={uploadProgress} />
            <span>{uploadProgress} %</span>
          </div>
        )}
        {status && <p className="uploadStatus">{status}</p>}
        {!!errors.length && (
          <ul className="uploadErrors">
            {errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        )}

        <div className="uploadItems">
          {uploads.map((upload) => {
            const result = importResults[upload.id]
            return (
              <article className={`uploadItem ${result?.status || ""}`} key={upload.id}>
                <div className="uploadItemHeader">
                  <span>
                    <strong>{upload.originalName}</strong>
                    <small>
                      {formatFileSize(upload.size)} · {upload.audio.container || upload.audio.codec || "Audio"}
                      {upload.audio.lossless ? " · Lossless" : ""}
                      {upload.embeddedCover ? " · Cover vorhanden" : ""}
                      {upload.duplicate ? " · Bereits auf dem Server – wird übersprungen" : upload.duplicateInBatch ? " · Doppelt ausgewählt – wird übersprungen" : upload.possibleDuplicate ? " · Mögliches Duplikat im Bestand – bitte prüfen" : ""}
                    </small>
                  </span>
                  {result && (
                    <span className="uploadResult">
                      {result.status === "imported" ? "Importiert" : result.status === "duplicate" ? "Bereits vorhanden" : result.error}
                    </span>
                  )}
                  <button type="button" disabled={isImporting} onClick={() => removeUpload(upload)} aria-label={`${upload.originalName} entfernen`}><Trash2 size={24} /> Entfernen</button>
                </div>
                <div className="metadataGrid">
                  <label>Titel<input value={upload.metadata.title} onChange={(event) => updateMetadata(upload.id, "title", event.target.value)} /></label>
                  <label>Künstler<input value={upload.metadata.artist} onChange={(event) => updateMetadata(upload.id, "artist", event.target.value)} /></label>
                  <label>Album<input value={upload.metadata.album} onChange={(event) => updateMetadata(upload.id, "album", event.target.value)} /></label>
                  <label>Albumkünstler<input value={upload.metadata.albumArtist} onChange={(event) => updateMetadata(upload.id, "albumArtist", event.target.value)} /></label>
                  <label>Track<input type="number" min="0" max="999" value={upload.metadata.track || 0} onChange={(event) => updateMetadata(upload.id, "track", event.target.value)} /></label>
                  <label>CD<input type="number" min="0" max="99" value={upload.metadata.disc || 0} onChange={(event) => updateMetadata(upload.id, "disc", event.target.value)} /></label>
                  <label>Jahr<input type="number" min="0" max="9999" value={upload.metadata.year || 0} onChange={(event) => updateMetadata(upload.id, "year", event.target.value)} /></label>
                  <label>Genre<input value={upload.metadata.genre} onChange={(event) => updateMetadata(upload.id, "genre", event.target.value)} /></label>
                </div>
              </article>
            )
          })}
        </div>

        {!!uploads.length && (
          <div className="uploadFooter">
            <span>{uploads.length} {uploads.length === 1 ? "Datei" : "Dateien"}</span>
            <button type="button" onClick={importFiles} disabled={isUploading || isImporting}>
              {isImporting ? "Importiere …" : "Alle importieren"}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

function DevicesDialog({
  auth,
  playerDevice,
  playerConnectionStatus,
  playerConnectionMessage,
  playerPairingCode,
  pairedControllers,
  onChangePlayerDevice,
  onRequestPairingCode,
  onRevokeController,
  controlPairings,
  pairingStatus,
  onPair,
  onForgetPairing,
  remotePairing,
  onSelectRemote,
  remoteConnectionStatus,
  remoteConnectionMessage,
  remotePlayerOnline,
  remotePlaybackState,
  onRemoteCommand,
  onClose,
}) {
  const [pairCode, setPairCode] = useState("")
  const [playerName, setPlayerName] = useState(playerDevice.name)

  useEffect(() => setPlayerName(playerDevice.name), [playerDevice.name])


  const statusLabel = {
    disabled: "Nicht als Player aktiviert",
    connecting: "Verbindet …",
    connected: "Online und fernsteuerbar",
    offline: "Offline – Verbindung wird wiederhergestellt",
    error: playerConnectionMessage || "Verbindungsfehler",
  }[playerConnectionStatus]

  return (
    <div className="modalBackdrop">
      <section className="actionSheet deviceSheet" onClick={(event) => event.stopPropagation()}>
        <header>
          <h2>Wiedergabegeräte</h2>
          <button type="button" onClick={onClose}>Schließen</button>
        </header>

        <div className="deviceSection">
          <h3>Dieses Gerät</h3>
          <label className="deviceToggle">
            <input
              type="checkbox"
              checked={playerDevice.enabled}
              onChange={(event) => onChangePlayerDevice({ enabled: event.target.checked })}
            />
            Als fernsteuerbaren Player bereitstellen
          </label>
          <div className="deviceNameRow">
            <input
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              aria-label="Playername"
              maxLength={80}
            />
            <button
              type="button"
              onClick={() => onChangePlayerDevice({ name: playerName.trim() || "Player" })}
            >
              Speichern
            </button>
          </div>
          <p className={`deviceStatus ${playerConnectionStatus}`}>{statusLabel}</p>

          {playerDevice.enabled && (
            <>
              <button type="button" onClick={onRequestPairingCode} disabled={playerConnectionStatus !== "connected"}>
                Kopplungscode erzeugen
              </button>
              {playerPairingCode && playerPairingCode.expiresAt > Date.now() && (
                <div className="pairingCode" aria-label={`Kopplungscode ${playerPairingCode.code}`}>
                  <strong>{playerPairingCode.code}</strong>
                  <span>5 Minuten gültig</span>
                </div>
              )}
              {!!pairedControllers.length && (
                <div className="pairedList">
                  <h3>Gekoppelte Fernbedienungen</h3>
                  {pairedControllers.map((controller) => (
                    <div className="pairedDevice" key={controller.id}>
                      <span>
                        <strong>{controller.name}</strong>
                        <small>{controller.username}</small>
                      </span>
                      <button type="button" onClick={() => onRevokeController(controller.id)} aria-label="Kopplung entfernen">
                        <Trash2 size={24} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="deviceSection">
          <h3>Anderen Player koppeln</h3>
          <div className="pairCodeEntry">
            <input
              value={pairCode}
              onChange={(event) => setPairCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-stelliger Code"
              aria-label="Kopplungscode"
            />
            <button type="button" onClick={() => onPair(pairCode)}>Koppeln</button>
          </div>
          {pairingStatus && <p className="deviceStatus">{pairingStatus}</p>}
        </div>

        {!!controlPairings.length && (
          <div className="deviceSection">
            <h3>Meine Player</h3>
            <div className="pairedList">
              {controlPairings.map((pairing) => (
                <div className="pairedDevice" key={pairing.playerId}>
                  <button className="pairedDeviceMain" type="button" onClick={() => onSelectRemote(pairing)}>
                    <Cast size={26} />
                    <span>
                      <strong>{pairing.playerName}</strong>
                      <small>Steuern</small>
                    </span>
                  </button>
                  <button type="button" onClick={() => onForgetPairing(pairing.playerId)} aria-label="Player vergessen">
                    <Trash2 size={24} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}


function RepeatModeIcon({ mode }) {
  if (RADIO_MODES.has(mode)) {
    return (
      <svg aria-hidden="true" className="repeatModeIcon" viewBox="0 0 48 48">
        <path d="M11 14h26a5 5 0 0 1 5 5v19a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5V19a5 5 0 0 1 5-5Z" />
        <path d="m13 14 19-9" />
        {mode === "liked-radio" ? (
          <path d="M17 36s-7-4.2-7-9a4 4 0 0 1 7-2.5A4 4 0 0 1 24 27c0 4.8-7 9-7 9Z" />
        ) : (
          <circle cx="17" cy="29" r="7" />
        )}
        <path d="M31 25h6M31 31h6M31 37h4" />
      </svg>
    )
  }

  if (mode === "no-repeat") {
    return (
      <svg aria-hidden="true" className="repeatModeIcon" viewBox="0 0 48 48">
        <path d="M24 6v33" />
        <path d="m15 30 9 9 9-9" />
      </svg>
    )
  }

  return (
    <svg aria-hidden="true" className="repeatModeIcon" viewBox="0 0 48 48">
      <path d="M24 24A10 10 0 1 1 22 18" />
      <path d="m16 18 6 0-2-6" />
      {mode === "playlist" ? (
        <path className="repeatModeBars" d="M30 16h15M30 24h15M30 32h15" />
      ) : (
        <path className="repeatModeBars" d="M30 24h15" />
      )}
    </svg>
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
        if (event.dataTransfer.types.includes("application/x-navidrome-song")) return
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
      <button className="songText" type="button" onClick={onPlay} draggable
        onDragStart={(event) => { event.dataTransfer.setData("application/x-navidrome-song", JSON.stringify(song)); event.dataTransfer.effectAllowed = "copy" }}>
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
        if (event.dataTransfer.types.includes("application/x-navidrome-song")) return
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
  onRate,
  radioInfo,
  onRadioKindChange,
  onDownload,
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
  uiScale,
  onUiScaleChange,
  minimumRating,
  onMinimumRatingChange,
  canManageLibrary,
  onMarkDuplicate,
  onDeleteSong,
  onShowDuplicates,
  canUploadMusic,
  onOpenUpload,
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

  function stopDialogEvent(event) {
    event.stopPropagation()
  }

  return (
    <div className="modalBackdrop">
      <section
        className={actionSheetClassName}
        ref={actionSheetRef}
        onClick={stopDialogEvent}
        onPointerDown={stopDialogEvent}
        onTouchStart={stopDialogEvent}
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
            {radioInfo?.analysis && <p className="deviceStatus">Smart Radio: {radioInfo.analysis.analyzed} / {radioInfo.analysis.total} Songs analysiert{radioInfo.analysis.running ? " · Analyse läuft" : ""}</p>}
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
            <div className="userMenuActions">
              <div className="scaleSetting">
                <h3>Skalierung</h3>
                <div className="scaleButtons">
                  {UI_SCALE_OPTIONS.map((option) => (
                    <button
                      className={uiScale === option.value ? "selected" : ""}
                      key={option.value}
                      type="button"
                      aria-pressed={uiScale === option.value}
                      onClick={() => onUiScaleChange(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ratingFilterSetting">
                <h3>Mindestbewertung</h3>
                <div className="ratingFilterButtons">
                  {RATING_FILTER_OPTIONS.map((option) => (
                    <button
                      className={minimumRating === option.value ? "selected" : ""}
                      key={option.value}
                      type="button"
                      aria-pressed={minimumRating === option.value}
                      onClick={() => onMinimumRatingChange(option.value)}
                    >
                      {option.label}
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
              {canUploadMusic && (
                <button type="button" onClick={onOpenUpload}>
                  <Upload size={28} />
                  Musik hochladen
                </button>
              )}
              {canManageLibrary && <button type="button" onClick={onShowDuplicates}>Duplikate vom Server löschen</button>}
              <button type="button" onClick={onLoginAnotherUser}>
                Anmelden
              </button>
              <button type="button" onClick={onLogout}>
                <LogOut size={28} />
                Logout
              </button>
            </div>
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
          <div className="songRatingSetting">
            <h3>Bewertung</h3>
            <div className="songRatingButtons">
              <button
                className={Number(menu.song.userRating || 0) === 0 ? "selected" : ""}
                type="button"
                aria-label="Bewertung entfernen"
                aria-pressed={Number(menu.song.userRating || 0) === 0}
                onClick={() => onRate(0)}
              >
                <X size={24} />
                Keine
              </button>
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  className={Number(menu.song.userRating || 0) === rating ? "selected" : ""}
                  key={rating}
                  type="button"
                  aria-label={`${rating} ${rating === 1 ? "Stern" : "Sterne"}`}
                  aria-pressed={Number(menu.song.userRating || 0) === rating}
                  onClick={() => onRate(rating)}
                >
                  <Star
                    size={28}
                    fill={rating <= Number(menu.song.userRating || 0) ? "currentColor" : "none"}
                  />
                </button>
              ))}
            </div>
          </div>
        )}
        {isSongMenu && radioInfo && <div className="songRatingSetting">
          <h3>Smart Radio · {radioInfo.song ? ({ music: "Musik", speech: "Sprache", unknown: "Noch unklar" }[radioInfo.song.kind]) : "Analyse ausstehend"}</h3>
          {canManageLibrary && <div className="themeButtons">{[{ value: "auto", label: "Automatisch" }, { value: "music", label: "Musik" }, { value: "speech", label: "Sprache / Kabarett" }].map((option) => <button key={option.value} type="button" className={(radioInfo.song?.override || "auto") === option.value ? "selected" : ""} onClick={() => onRadioKindChange(option.value)}>{option.label}</button>)}</div>}
        </div>}

        {isSongMenu && (
          <button type="button" onClick={onDownload}>
            <Download size={24} />
            Herunterladen
          </button>
        )}
        {isSongMenu && canManageLibrary && <>
          <button type="button" onClick={onMarkDuplicate}>Als Duplikat markieren</button>
          <button type="button" onClick={onDeleteSong}><Trash2 size={24} /> Song vom Server löschen</button>
        </>}

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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: "none",
      })
      .then(() => navigator.storage?.persist?.())
      .catch(() => {})
  })
}
