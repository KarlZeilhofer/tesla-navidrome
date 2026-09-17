# Tesla Navidrome

Tesla Navidrome is a touch-optimized web UI for [Navidrome](https://www.navidrome.org/) and compatible OpenSubsonic servers. It is designed for the Tesla in-car browser, where the usable viewport is limited, touch targets need to be large, and the on-screen keyboard covers the lower part of the page.

The app is a Vite/React single-page app. It is intended to run on the same origin as Navidrome, for example:

```text
https://navidrome.example.com/tesla/
```

## Goals

- Large, predictable touch controls for a Tesla browser viewport.
- Search input at the top, so it stays usable when the keyboard opens.
- HTML audio playback through Navidrome/OpenSubsonic stream URLs.
- Keep Tesla-specific login state independent from Navidrome's standard `/app` UI.
- Provide a focused driving UI without the full Navidrome desktop interface.
- Keep the project small enough to customize and publish as open source.

## Features

- Login through Navidrome's `/auth/login` endpoint.
- Stores Tesla-specific sessions locally, separate from Navidrome's normal web client.
- Supports multiple locally saved Navidrome users and quick switching between them.
- Logout removes only the currently active local user profile.
- Bottom playback bar with previous, play/pause, next, progress, current song, time, and like button.
- Search for songs and playlists.
- Special playlist search: typing `p`, `pl`, `play`, `playlist`, etc. lists all playlists while still showing other matching results.
- `Liked` button loads all starred songs.
- `Zufall` button loads 30 random songs into the result list.
- Result actions:
  - play a single song now
  - append to Verlauf
  - insert after the current song
  - add to playlist
  - show album
  - show Künstler
- Result list bulk actions:
  - play all
  - insert all
  - append all
  - replace Verlauf
- Playlist view:
  - opens playlists in the result pane without autoplay
  - shows a top `Zurueck` button instead of the search field
  - can reorder songs by drag and drop
  - can remove songs from the playlist
- Album and Künstler views:
  - accessible from song menus
  - show `Album ...` or `Künstler ...` as the result title
  - use the same top `Zurueck` navigation
- Verlauf:
  - local playback queue/history
  - persists across browser restarts
  - keeps up to 200 past songs
  - keeps at least 8 future songs after skips
  - drag and drop reorder with visible drag ghost and insertion marker
  - remove past or future songs
  - shuffle Verlauf while keeping the current song first
  - clear and refill with random songs
  - append Verlauf to an existing playlist
  - create a new playlist from Verlauf
  - remove locally detected skipped/unpopular songs
- Theme mode:
  - auto, dark, and light modes
  - auto follows `prefers-color-scheme`
- Media Session API handlers for play, pause, previous, next, seek backward, and seek forward where the browser supports them.

## OpenSubsonic API Usage

The app talks to Navidrome through same-origin endpoints:

- `/auth/login`
- `/rest/ping.view`
- `/rest/search3.view`
- `/rest/getPlaylists.view`
- `/rest/getPlaylist.view`
- `/rest/getRandomSongs.view`
- `/rest/getStarred2.view`
- `/rest/getAlbum.view`
- `/rest/getCoverArt.view`
- `/rest/stream.view`
- `/rest/star.view`
- `/rest/unstar.view`
- `/rest/updatePlaylist.view`
- `/rest/createPlaylist.view`

The app receives OpenSubsonic auth values through `/auth/login` and stores them under Tesla-specific local storage keys. It does not depend on or modify Navidrome `/app` login state.

## Local Development

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Build the production bundle:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Deployment

This repo is configured for serving under `/tesla/`:

```js
// vite.config.js
base: "/tesla/"
```

The included deployment script builds the app and copies `dist/` to `/var/www/tesla-navidrome`:

```bash
scripts/deploy.sh
```

On the current server this is also exposed through the helper command:

```bash
tesla-navidrome-deploy
```

The production web server must route `/tesla/` to the built static files and proxy the existing Navidrome API paths on the same origin.

## Tesla Browser Notes

The UI is tuned for a browser area around `1170x920` px. On narrower screens, the complete 1170 px design is scaled proportionally to the current viewport width so its original proportions remain intact. It remains usable when the keyboard reduces the visible height to about `1170x550` px.

Touch targets are intentionally large. Most important controls are at least about `100x60` px. The search area is kept at the top because the Tesla keyboard opens from the bottom.

Some Tesla-specific hardware/browser behavior still needs vehicle testing:

- scroll wheel next/back
- scroll wheel play after pause
- whether the browser shows an audio/video playback hint even though the app uses only an HTML `<audio>` element

## Project Structure

```text
.
|-- index.html
|-- package.json
|-- scripts/
|   `-- deploy.sh
|-- src/
|   |-- main.jsx
|   `-- styles.css
`-- vite.config.js
```

## State Stored In The Browser

The app stores local UI/playback state in local storage:

- `teslaNavidromeState`: Verlauf, current index, playback position, and play state.
- `teslaNavidromeTheme`: selected theme mode.
- `teslaNavidromeSkipStats`: local skip statistics for removing unpopular songs from Verlauf.
- `teslaNavidromeCurrentAuth`: currently active Tesla user session.
- `teslaNavidromeUserProfiles`: locally saved Tesla user sessions for quick switching.

Login state is intentionally local to this app. Logging in or out of `/tesla/` should not log the same browser in or out of Navidrome's standard `/app` interface.

## Current Status

This is an early, working Tesla-focused client. The main playback, search, playlist, liked songs, album/Künstler, and Verlauf workflows are implemented. Remaining tracked work is in `ISSUES.md`.
