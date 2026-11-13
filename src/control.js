const CONTROL_PATH = "/tesla-control/ws"

export function createDeviceIdentity(prefix) {
  const randomBytes = new Uint8Array(24)
  crypto.getRandomValues(randomBytes)
  const secret = Array.from(randomBytes, (value) => value.toString(16).padStart(2, "0")).join("")
  return {
    id: `${prefix}-${crypto.randomUUID()}`,
    secret,
  }
}

export function controlAuth(auth) {
  return {
    username: auth.username,
    token: auth.subsonicToken,
    salt: auth.salt,
  }
}

function controlWebSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}${CONTROL_PATH}`
}

export function createControlConnection({ hello, onMessage, onStatus, reconnect = true }) {
  let socket = null
  let stopped = false
  let reconnectTimer = null
  let reconnectAttempt = 0

  const notifyStatus = (status, detail = "") => onStatus?.(status, detail)

  function scheduleReconnect() {
    if (stopped || !reconnect) return
    const delay = Math.min(15_000, 750 * 2 ** reconnectAttempt)
    reconnectAttempt += 1
    reconnectTimer = window.setTimeout(connect, delay)
  }

  function connect() {
    if (stopped) return
    notifyStatus("connecting")
    socket = new WebSocket(controlWebSocketUrl())

    socket.addEventListener("open", () => {
      reconnectAttempt = 0
      socket.send(JSON.stringify(typeof hello === "function" ? hello() : hello))
    })

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === "authenticated") notifyStatus("connected")
        if (message.type === "error") notifyStatus("error", message.message || "Verbindungsfehler")
        onMessage?.(message)
      } catch {
        notifyStatus("error", "Ungültige Antwort des Kopplungsdienstes")
      }
    })

    socket.addEventListener("close", () => {
      socket = null
      if (!stopped) {
        notifyStatus("offline")
        scheduleReconnect()
      }
    })

    socket.addEventListener("error", () => notifyStatus("error", "Kopplungsdienst nicht erreichbar"))
  }

  connect()

  return {
    send(type, payload = {}) {
      if (socket?.readyState !== WebSocket.OPEN) return false
      socket.send(JSON.stringify({ type, ...payload }))
      return true
    },
    close() {
      stopped = true
      window.clearTimeout(reconnectTimer)
      socket?.close()
      socket = null
    },
  }
}
