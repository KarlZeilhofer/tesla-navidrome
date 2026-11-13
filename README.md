# Tesla Navidrome

Tesla Navidrome is a touch-optimized web UI for [Navidrome](https://www.navidrome.org/) and compatible OpenSubsonic servers. It is designed for the Tesla in-car browser, where the usable viewport is limited, touch targets need to be large, and the on-screen keyboard covers the lower part of the page.

The app is a Vite/React single-page app. It is intended to run on the same origin as Navidrome, for example:

```text
https://navidrome.example.com/tesla/
```

## Goals

- Large, predictable touch controls for a Tesla browser viewport.
- Search input at the top, so it stays usable when the keyboard opens.
- HTML audio playback through Navidrome/OpenSubsonic stream URLs. Original audio is requested without forced transcoding so browser-supported formats such as FLAC are delivered unchanged.
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
- Repeat button cycles through playlist, song, radio, LikedRadio, and no-repeat modes.
- Smart Radio continues with acoustically similar songs, using the last five listened tracks and a persistent, deliberately chosen anchor against mood drift.
- LikedRadio uses the same recommendation policy, restricted to the active user's liked songs. User ratings, library permissions, recently queued songs, duplicate titles and artist variety are respected.
- Music and spoken programmes are kept separate. Speech-dominated artists are also kept out of music stations after at least four speech detections and a 65% speech share; per-song manual overrides take precedence.
- Automatic additions are buffered three songs ahead; local search and explicitly queued songs remain under user control. If no suitable analyzed candidate exists, Radio reports that instead of reverting to unfiltered random playback.
- Song action dialogs can set or clear the current user's 1–5 star rating.
- User settings can hide unrated and lower-rated songs with a per-user minimum rating of 2+, 3+, 4+, or 5 stars.
- On phone-sized viewports, search results and the playback queue use the full content width and can be switched with a horizontal swipe.
- Phone-sized viewports use a separate 2x scaling baseline, while desktop and Tesla retain the original scale factors.
- Installable Android PWA with standalone display mode and dedicated app icons.
- Offline app shell plus an automatic, oldest-first-limited audio cache of up to 1 GB for previously played songs.
- Optional Connect-style device control: register a browser as a named player, pair controllers with a short-lived six-digit code, and remotely control playback, seek position, repeat mode, queue, mute, and player volume.
- Paired family members search with their own Navidrome account while the selected tablet remains the audio output device.
- Device button: click to toggle remote playback; hold or right-click to choose a device. The normal player UI shows the target queue and playback state while search stays local.
- Upload preview flags exact source-file duplicates and possible existing title/artist matches; individual staged tracks can be removed before import.
- Administrators can mark library songs as duplicates or remove individual songs. Removal requires dragging the confirmation arrow across the entire track. Files are moved to a protected server trash folder and automatically purged within three calendar months.
- Desktop-only administrator upload dialog with drag-and-drop, folder selection, upload progress, embedded-tag and filename analysis, editable metadata, duplicate handling, and lossless metadata remuxing before import.
- Result actions:
  - play a single song now
  - append to Verlauf
  - insert after the current song
  - add to playlist
  - show album
  - show Künstler
  - download the original song file
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
- `/rest/setRating.view`
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

Device control and desktop music uploads use the Node.js service in `server/control-server.mjs`. The deployment script installs it as the hardened `tesla-navidrome-control.service`; nginx proxies `/tesla-control/` to its local port. Persistent pairings contain only hashed random device secrets and are stored in `/var/lib/tesla-navidrome-control`.

Uploads are restricted server-side to the usernames configured in `UPLOAD_ALLOWED_USERS` (currently `karl`). Files are streamed to a private staging directory, inspected with `music-metadata`, and shown for confirmation before import. Ogg/Vorbis and Opus comments are updated with Mutagen on a copy, preserving embedded artwork, lyrics, custom comments and compressed audio packets. Other formats use `ffmpeg -c copy`; audio is never re-encoded. Imported files are organized below `/srv/music/Uploads/<Albumartist>/<Album>/` and picked up by Navidrome's file watcher.

Dropped folders are read recursively, including paginated browser directory entries. Uploads are divided into batches of up to 20 files / 256 MiB (single larger files travel alone), and imports into batches of 100. Non-audio sidecar files are ignored. Multipart filenames use UTF-8 so umlauts survive both upload and filename-based metadata detection.

## Smart Radio analysis

`tesla-navidrome-radio.service` runs locally on port 4782 as the Navidrome service user, with read-only access to Navidrome's database and audio files. Only the authenticated Node gateway can expose its results through `/tesla-control/radio/`. Candidate tracks and ratings are obtained from the active user's OpenSubsonic API, not from browser-provided permissions or ratings.

The worker analyzes three 20-second excerpts per track. Discogs-EffNet produces normalized 1280-dimensional audio embeddings; YAMNet estimates music, speech and singing. The fixed 64-patch model input is padded and only real audio patches contribute to the vector. Analysis results and manual content-type overrides persist in `/var/lib/tesla-navidrome-radio/analysis.sqlite`. Files are checked every 30 seconds between scans, and identical source-file hashes reuse cached analysis. Failures are retried after a day; newly requested, unanalyzed context tracks are prioritized during a scan.

Recommendation uses 65% recent-context similarity and 35% anchor similarity, then applies personal preferences, repeat exclusions and artist diversity. It samples from a short list of good matches rather than always selecting the nearest neighbour. A minimum match threshold is applied, and unclassified tracks do not enter automatic stations.

`scripts/setup-radio.sh` creates an isolated Python environment and downloads SHA-256-verified model weights. Model attribution and non-commercial license terms are documented in [server/RADIO_MODELS.md](server/RADIO_MODELS.md). Music never leaves the server. The user dialog shows analysis progress; administrators can correct “Music / Speech” in song menus.

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
- `teslaNavidromeScale`: selected UI scaling level.
- `teslaNavidromeRepeatMode`: selected repeat mode.
- `teslaNavidromeMinimumRating:<username>`: client-side minimum-rating filter for each saved user.
- `teslaNavidromeSkipStats`: local skip statistics for removing unpopular songs from Verlauf.
- `teslaNavidromeCurrentAuth`: currently active Tesla user session.
- `teslaNavidromeUserProfiles`: locally saved Tesla user sessions for quick switching.
- `teslaNavidromePlayerDevice`: local identity, name, and enabled state when this browser is offered as a remote player.
- `teslaNavidromePlayerVolume` and `teslaNavidromePlayerMuted`: player-level volume state.
- `teslaNavidromeControlPairings`: controller tokens for explicitly paired remote players.

Login state is intentionally local to this app. Logging in or out of `/tesla/` should not log the same browser in or out of Navidrome's standard `/app` interface.

## Current Status

This is an early, working Tesla-focused client. The main playback, search, playlist, liked songs, album/Künstler, and Verlauf workflows are implemented. Remaining tracked work is in `ISSUES.md`.
