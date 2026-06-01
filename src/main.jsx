import React, { useEffect, useMemo, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  Heart,
  ListPlus,
  LogOut,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
} from "lucide-react"
import "./styles.css"

const CLIENT = "TeslaNavidrome"
const API_VERSION = "1.16.1"

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
    duration: song.duration || 0,
    coverArt: song.coverArt,
    starred: Boolean(song.starred),
  }
}

function App() {
  const [auth, setAuth] = useState(authState)
  const [query, setQuery] = useState("")
  const [songs, setSongs] = useState([])
  const [queue, setQueue] = useState([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [status, setStatus] = useState("")
  const [time, setTime] = useState({ current: 0, duration: 0 })
  const audioRef = useRef(null)
  const searchInputRef = useRef(null)

  const currentSong = currentIndex >= 0 ? queue[currentIndex] : null
  const canUseApi = auth.username && auth.subsonicToken && auth.salt

  const streamUrl = useMemo(() => {
    if (!currentSong || !canUseApi) return ""
    return subsonicUrl("stream", { id: currentSong.id, maxBitRate: 320 }, auth)
  }, [auth, canUseApi, currentSong])

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
      return
    }
    const handle = window.setTimeout(async () => {
      try {
        setStatus("Suche...")
        const data = await subsonic(
          "search3",
          {
            query,
            artistCount: 0,
            albumCount: 4,
            songCount: 40,
          },
          auth,
        )
        setSongs((data.searchResult3?.song || []).map(normalizeSong))
        setStatus("")
      } catch (err) {
        setStatus(err.message)
      }
    }, 250)
    return () => window.clearTimeout(handle)
  }, [auth, canUseApi, query])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () =>
      setTime({ current: audio.currentTime || 0, duration: audio.duration || currentSong?.duration || 0 })
    const onEnded = () => next()
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    audio.addEventListener("timeupdate", onTime)
    audio.addEventListener("durationchange", onTime)
    audio.addEventListener("ended", onEnded)
    audio.addEventListener("play", onPlay)
    audio.addEventListener("pause", onPause)
    return () => {
      audio.removeEventListener("timeupdate", onTime)
      audio.removeEventListener("durationchange", onTime)
      audio.removeEventListener("ended", onEnded)
      audio.removeEventListener("play", onPlay)
      audio.removeEventListener("pause", onPause)
    }
  })

  useEffect(() => {
    if (!streamUrl || !audioRef.current) return
    audioRef.current.src = streamUrl
    audioRef.current.play().catch((err) => {
      setStatus(`Playback braucht eine Touch-Geste: ${err.message}`)
    })
  }, [streamUrl])

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

  function playNow(song, list = null) {
    const nextQueue = list || [song]
    const idx = nextQueue.findIndex((item) => item.id === song.id)
    setQueue(nextQueue)
    setCurrentIndex(idx >= 0 ? idx : 0)
  }

  function addToQueue(song) {
    setQueue((items) => {
      const nextItems = [...items, song]
      if (currentIndex < 0) setCurrentIndex(0)
      return nextItems
    })
    setStatus(`Zur Queue hinzugefuegt: ${song.title}`)
  }

  function previous() {
    setCurrentIndex((idx) => Math.max(0, idx - 1))
  }

  function next() {
    setCurrentIndex((idx) => {
      if (idx < 0) return idx
      return Math.min(queue.length - 1, idx + 1)
    })
  }

  async function togglePlayback() {
    const audio = audioRef.current
    if (!audio) return
    if (!currentSong && songs.length) {
      playNow(songs[0], songs)
      return
    }
    if (audio.paused) {
      await audio.play()
    } else {
      audio.pause()
    }
  }

  async function toggleStar(song) {
    try {
      await subsonic(song.starred ? "unstar" : "star", { id: song.id }, auth)
      const update = (item) => (item.id === song.id ? { ...item, starred: !song.starred } : item)
      setSongs((items) => items.map(update))
      setQueue((items) => items.map(update))
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
      if (randomSongs[0]) playNow(randomSongs[0], randomSongs)
      setStatus("")
    } catch (err) {
      setStatus(err.message)
    }
  }

  function logout() {
    clearAuth()
    setAuth(authState())
    setQueue([])
    setSongs([])
    setCurrentIndex(-1)
  }

  if (!auth.isAuthenticated || !canUseApi) {
    return (
      <main className="loginScreen">
        <section className="loginPanel">
          <p className="eyebrow">Tesla Navidrome</p>
          <h1>Login</h1>
          <form onSubmit={login}>
            <input name="username" autoComplete="username" placeholder="Benutzer" />
            <input name="password" autoComplete="current-password" placeholder="Passwort" type="password" />
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
        <div className="clock">
          {formatTime(time.current)} / {formatTime(time.duration || currentSong?.duration || 0)}
        </div>
      </header>

      <section className="searchBar">
        <Search size={30} />
        <input
          ref={searchInputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Suche nach Titel, Album oder Artist"
        />
        <button type="button" onClick={randomPlay}>Zufall</button>
        <button className="secondaryButton" type="button" onClick={logout}>
          <LogOut size={24} />
          Logout
        </button>
      </section>

      <section className="content">
        <div className="results">
          <div className="sectionHeader">
            <h2>Treffer</h2>
            <span>{status || `${songs.length} Songs`}</span>
          </div>
          <div className="songList">
            {songs.map((song) => (
              <SongRow
                key={song.id}
                song={song}
                auth={auth}
                onPlay={() => playNow(song, songs)}
                onQueue={() => addToQueue(song)}
                onStar={() => toggleStar(song)}
              />
            ))}
          </div>
        </div>

        <aside className="queue">
          <div className="sectionHeader">
            <h2>Queue</h2>
            <span>{queue.length}</span>
          </div>
          {queue.map((song, index) => (
            <button
              key={`${song.id}-${index}`}
              className={index === currentIndex ? "queueItem active" : "queueItem"}
              type="button"
              onClick={() => setCurrentIndex(index)}
            >
              <strong>{song.title}</strong>
              <span>{song.artist}</span>
            </button>
          ))}
        </aside>
      </section>
    </main>
  )
}

function SongRow({ song, auth, onPlay, onQueue, onStar }) {
  const coverUrl = song.coverArt
    ? subsonicUrl("getCoverArt", { id: song.coverArt, size: 96, square: true }, auth)
    : ""

  return (
    <article className="songRow">
      <button className="coverButton" type="button" onClick={onPlay}>
        {coverUrl ? <img src={coverUrl} alt="" /> : <Play size={34} />}
      </button>
      <button className="songText" type="button" onClick={onPlay}>
        <strong>{song.title}</strong>
        <span>{song.artist}</span>
      </button>
      <button className="actionButton" type="button" onClick={onQueue}>
        <ListPlus size={28} />
        Queue
      </button>
      <button className={song.starred ? "actionButton liked" : "actionButton"} type="button" onClick={onStar}>
        <Heart size={28} fill={song.starred ? "currentColor" : "none"} />
        Like
      </button>
    </article>
  )
}

createRoot(document.getElementById("root")).render(<App />)
