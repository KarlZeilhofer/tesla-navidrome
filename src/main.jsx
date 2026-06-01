import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import {
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
  X,
} from "lucide-react"
import "./styles.css"

const CLIENT = "TeslaNavidrome"
const API_VERSION = "1.16.1"
const STORAGE_KEY = "teslaNavidromeState"
const THEME_KEY = "teslaNavidromeTheme"
const MIN_FUTURE = 8
const MAX_HISTORY = 200

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
}

function clearAuth() {
  for (const key of [
    "token",
    "userId",
    "name",
    "username",
    "avatar",
    "role",
    "subsonic-salt",
    "subsonic-token",
    "is-authenticated",
  ]) {
    localStorage.removeItem(key)
  }
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
    artist: song.artist || song.albumArtist || "Unknown artist",
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

function loadSavedState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
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

function saveState({ verlauf, currentIndex, position, wasPlaying }) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      verlauf: verlauf.slice(-MAX_HISTORY - MIN_FUTURE),
      currentIndex,
      position,
      wasPlaying,
      savedAt: Date.now(),
    }),
  )
}

function App() {
  const savedState = useMemo(loadSavedState, [])
  const [auth, setAuth] = useState(authState)
  const [query, setQuery] = useState("")
  const [songs, setSongs] = useState([])
  const [playlistResults, setPlaylistResults] = useState([])
  const [verlauf, setVerlauf] = useState(savedState?.verlauf || [])
  const [currentIndex, setCurrentIndex] = useState(savedState?.currentIndex ?? -1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [status, setStatus] = useState("")
  const [time, setTime] = useState({ current: savedState?.position || 0, duration: 0 })
  const [theme, setTheme] = useState(localStorage.getItem(THEME_KEY) || "auto")
  const [showPassword, setShowPassword] = useState(false)
  const [menu, setMenu] = useState(null)
  const [playlists, setPlaylists] = useState([])
  const [newPlaylistName, setNewPlaylistName] = useState("")
  const audioRef = useRef(null)
  const currentRowRef = useRef(null)
  const pendingSeekRef = useRef(savedState?.position || 0)
  const didRestorePositionRef = useRef(false)
  const randomRefillRunning = useRef(false)

  const currentSong = currentIndex >= 0 ? verlauf[currentIndex] : null
  const futureCount = Math.max(0, verlauf.length - currentIndex - 1)
  const canUseApi = auth.username && auth.subsonicToken && auth.salt

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

  const next = useCallback(async () => {
    const currentFutureCount = Math.max(0, verlauf.length - currentIndex - 1)
    const added = currentIndex >= 0 && currentFutureCount < MIN_FUTURE ? await addRandomFuture(MIN_FUTURE - currentFutureCount) : []
    const availableLength = verlauf.length + added.length
    setCurrentIndex((idx) => {
      if (idx < 0) return idx
      return Math.min(availableLength - 1, idx + 1)
    })
  }, [addRandomFuture, currentIndex, verlauf.length])

  const previous = useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      setTime((value) => ({ ...value, current: 0 }))
      return
    }
    const currentFutureCount = Math.max(0, verlauf.length - currentIndex - 1)
    if (currentIndex >= 0 && currentFutureCount < MIN_FUTURE) {
      addRandomFuture(MIN_FUTURE - currentFutureCount)
    }
    setCurrentIndex((idx) => Math.max(0, idx - 1))
  }, [addRandomFuture, currentIndex, verlauf.length])

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
      subsonic("ping", {}, auth).catch(() => {
        setStatus("Login gefunden, aber API-Zugriff fehlgeschlagen. Bitte neu einloggen.")
      })
    }
  }, [auth, canUseApi])

  useEffect(() => {
    if (!query.trim() || !canUseApi) {
      setSongs([])
      setPlaylistResults([])
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
        setPlaylistResults(
          (playlistData.playlists?.playlist || [])
            .map(normalizePlaylist)
            .filter((playlist) => playlist.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),
        )
        setStatus("")
      } catch (err) {
        setStatus(err.message)
      }
    }, 250)
    return () => window.clearTimeout(handle)
  }, [auth, canUseApi, query])

  useEffect(() => {
    if (currentIndex <= MAX_HISTORY || verlauf.length <= MAX_HISTORY + MIN_FUTURE) return
    const drop = currentIndex - MAX_HISTORY
    setVerlauf((items) => items.slice(drop))
    setCurrentIndex((idx) => idx - drop)
  }, [currentIndex, verlauf.length])

  useEffect(() => {
    saveState({
      verlauf,
      currentIndex,
      position: audioRef.current?.currentTime || time.current || 0,
      wasPlaying: isPlaying,
    })
  }, [currentIndex, isPlaying, time.current, verlauf])

  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [currentIndex])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

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
    const onPlay = () => setIsPlaying(true)
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
  }, [currentSong?.duration, next])

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
    setVerlauf((items) => [...items.slice(0, currentIndex + 1), ...songs])
    setCurrentIndex((idx) => (idx < 0 ? 0 : idx + 1))
  }

  async function playPlaylist(playlist) {
    try {
      setStatus(`Lade Playlist: ${playlist.name}`)
      const data = await subsonic("getPlaylist", { id: playlist.id }, auth)
      const playlistSongs = (data.playlist?.entry || []).map(normalizeSong)
      setSongs(playlistSongs)
      if (playlistSongs.length) {
        setVerlauf((items) => [...items.slice(0, currentIndex + 1), ...playlistSongs])
        setCurrentIndex((idx) => (idx < 0 ? 0 : idx + 1))
      }
      setStatus("")
    } catch (err) {
      setStatus(err.message)
    }
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
      const data = await subsonic("getRandomSongs", { size: MIN_FUTURE }, auth)
      const randomSongs = (data.randomSongs?.song || []).map(normalizeSong)
      setSongs(randomSongs)
      setPlaylistResults([])
      setStatus("")
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function showAlbum(song) {
    if (!song.albumId) {
      setStatus("Kein Album fuer diesen Song gefunden.")
      return
    }
    try {
      const data = await subsonic("getAlbum", { id: song.albumId }, auth)
      setSongs((data.album?.song || []).map(normalizeSong))
      setStatus(`Album: ${song.album}`)
      setMenu(null)
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function showArtist(song) {
    setQuery(song.artist)
    setStatus(`Artist: ${song.artist}`)
    setMenu(null)
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
    setCurrentIndex(-1)
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
      <header className="playerBar">
        <button className="iconButton" type="button" onClick={previous} aria-label="Back">
          <SkipBack size={34} />
        </button>
        <button className="playButton" type="button" onClick={togglePlayback} aria-label="Play pause">
          {isPlaying ? <Pause size={40} /> : <Play size={40} />}
        </button>
        <button className="iconButton" type="button" onClick={next} aria-label="Next">
          <SkipForward size={34} />
        </button>
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
        <Search size={30} />
        <div className="searchField">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Suche nach Titel, Album, Artist oder Playlist" />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Suche löschen">
              <X size={28} />
            </button>
          )}
        </div>
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
          <button className="sectionHeader buttonHeader" type="button" onClick={() => setMenu({ type: "results" })}>
            <h2>Treffer</h2>
            <span>{status || `${songs.length} Songs / ${playlistResults.length} Playlists`}</span>
          </button>
          <div className="songList">
            {playlistResults.map((playlist) => (
              <PlaylistRow key={playlist.id} playlist={playlist} auth={auth} onPlay={() => playPlaylist(playlist)} />
            ))}
            {songs.map((song) => (
              <SongRow
                key={song.id}
                song={song}
                auth={auth}
                onPlay={() => insertAndPlay(song)}
                onQueue={() => addToVerlauf(song)}
                onMenu={() => {
                  setMenu({ type: "song", song })
                  loadPlaylists()
                }}
              />
            ))}
          </div>
        </div>

        <aside className="verlauf">
          <button className="sectionHeader buttonHeader" type="button" onClick={() => setMenu({ type: "verlauf" })}>
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
                active={index === currentIndex}
                onClick={() => setCurrentIndex(index)}
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
          onClear={clearVerlauf}
          onRemovePast={removePastSongs}
          onRemoveFuture={removeFutureSongs}
          onShuffle={shuffleVerlauf}
          onPlayAllResults={playAllResults}
          onLogout={logout}
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

function SongRow({ song, auth, onPlay, onQueue, onMenu }) {
  const coverUrl = song.coverArt ? subsonicUrl("getCoverArt", { id: song.coverArt, size: 96, square: true }, auth) : ""

  return (
    <article className="songRow">
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
        Verlauf
      </button>
      <button className="actionButton" type="button" onClick={onMenu} onPointerDown={longPress(onMenu)}>
        <MoreVertical size={28} />
        Mehr
      </button>
    </article>
  )
}

function PlaylistRow({ playlist, auth, onPlay }) {
  const coverUrl = playlist.coverArt ? subsonicUrl("getCoverArt", { id: playlist.coverArt, size: 96, square: true }, auth) : ""
  return (
    <article className="songRow playlistRow">
      <button className="coverButton" type="button" onClick={onPlay}>
        {coverUrl ? <img src={coverUrl} alt="" /> : <ListMusic size={34} />}
      </button>
      <button className="songText" type="button" onClick={onPlay}>
        <strong>{playlist.name}</strong>
        <span>Playlist - {playlist.songCount} Songs</span>
      </button>
      <button className="actionButton wideAction" type="button" onClick={onPlay}>
        <Play size={28} />
        Wiedergeben
      </button>
    </article>
  )
}

const VerlaufRow = React.forwardRef(function VerlaufRow({ song, active, onClick, onMenu }, ref) {
  return (
    <article className={active ? "verlaufRow active" : "verlaufRow"} ref={ref}>
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
  onClear,
  onRemovePast,
  onRemoveFuture,
  onShuffle,
  onPlayAllResults,
  onLogout,
  theme,
  onThemeChange,
}) {
  const isSongMenu = menu.type === "song" || menu.type === "verlaufSong"
  return (
    <div className="modalBackdrop" onClick={onClose}>
      <section className="actionSheet" onClick={(event) => event.stopPropagation()}>
        <header>
          <h2>{isSongMenu ? menu.song.title : "Verlauf"}</h2>
          <button type="button" onClick={onClose}>Schliessen</button>
        </header>

        {menu.type === "results" && <button type="button" onClick={onPlayAllResults}>Alle wiedergeben</button>}

        {menu.type === "user" && (
          <>
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
            <button type="button" onClick={onLogout}>
              <LogOut size={28} />
              Logout
            </button>
          </>
        )}

        {menu.type === "song" && <button type="button" onClick={onInsertAfter}>Einfügen nach aktuellem Song</button>}

        {menu.type === "verlaufSong" && (
          <>
            <button type="button" onClick={onShowAlbum}>Zeige Album</button>
            <button type="button" onClick={onShowArtist}>Zeige Artist</button>
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
            <button type="button" disabled>Unbeliebte Songs entfernen</button>
            <button type="button" disabled>Verlauf als Playlist speichern</button>
            <button type="button" onClick={onShuffle}>Verlauf würfeln</button>
          </>
        )}
      </section>
    </div>
  )
}

createRoot(document.getElementById("root")).render(<App />)
