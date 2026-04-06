# Spotify City

Spotify City is a React + Vite app that turns a user's Spotify listening data into a stylized 3D neon city. Each building represents an artist, the skyline reacts to your listening history, and hovering a building reveals artist-level music stats and tracks.

## What The Frontend Shows

### Login screen

- `Connect Spotify`: starts Spotify OAuth with PKCE
- `Reset login state`: clears stored auth/session state and reloads the app
- `Redirect URI`: the exact URI the app is currently using for Spotify auth

### Main city scene

- `3D skyline`: one building per artist in the current city dataset
- `Roads and pathways`: generated links between artist lots so the city reads like connected blocks instead of isolated towers
- `Rooftop details`: varied caps and rooftop gardens to make towers feel more like real buildings
- `Hover interaction`: hovering a building updates the artist card automatically
- `Orbit / drag / zoom`: lets you explore the city from different angles

### Left panel

- `Profile card`: your Spotify display name / city owner panel
- `Hours (est.)`: an estimated listening total derived from current artist and recent-play weighting in the app
- `Recent artists`: how many artists are active in the current recent listening pool
- `Underground`: a percentage-style indicator based on how strongly the current city leans toward lower-popularity artists
- `Top genre`: the dominant mapped genre bucket in the city
- `Badges`: listening-style badges inferred from your patterns, for example late-night listening or broader genre exploration
- `Districts`: the genre buckets used to color and organize the skyline

### Right artist card

When you hover a building, the right card shows:

- `Artist name` and avatar
- `Genre label`
- `Energy`
- `Danceability`
- `Valence`
- `Recent plays`
- `Last played`
- `Top track`
- `Top 3 tracks`
- `Preview player state` when a preview exists

### Bottom controls

- `Time slider`: changes the city mood/height scaling across the year-style timeline shown in the UI
- `Now playing bar`: controls Spotify preview playback when an artist track preview is available

### Top controls

- `Spotify City 2026` title pill
- `- / +`: zoom controls
- `Reset`: resets zoom/camera UI state
- `Logout`: clears auth and reloads

## How The City Is Built

- The app combines Spotify `top artists` with unique artists found in `recently played`
- It enriches artists with additional Spotify artist details when available
- Each artist becomes one building in the scene
- Roads are generated between nearby artists so the city forms rings and radial connections
- Building height, footprint, and accent behavior are driven by the artist's listening/activity data

## How The Metrics Are Calculated

### Energy

`Energy` comes from Spotify audio features for the artist's resolved top track when available.

- Primary source: `/audio-features` for the selected top track
- If Spotify audio features are unavailable, the app falls back to a synthetic value in a mid-range band so the city can still render

In practice, higher energy gives a more intense, more active-feeling building style.

### Danceability

`Danceability` also comes from Spotify audio features for the artist's top track.

- Primary source: `/audio-features`
- Fallback: a synthetic mid-range value if Spotify does not return audio features

In the city, danceability influences proportions and some footprint/shape behavior, helping certain buildings feel more rhythmic or club-like.

### Valence

`Valence` comes from Spotify audio features for the artist's top track.

- Primary source: `/audio-features`
- Fallback: a synthetic mid-range value if Spotify does not return audio features

Valence is used as a mood proxy. Higher valence generally represents brighter, more positive musical feel.

### Recent Plays

`Recent plays` is counted from Spotify `recently played` history.

- The app scans `/me/player/recently-played`
- Every artist on a played track is credited, not just the first artist
- The count becomes the artist's recent activity score in the city

### Last Played

`Last played` is computed as the day difference between now and the first recent playback seen for that artist in the current recent-history window.

### Top Track And Top 3 Tracks

The app resolves tracks in this order:

1. Spotify artist `top-tracks`
2. Tracks inferred from your recent listening history for that artist
3. Spotify search fallback
4. Artist albums and album-track fallback

This is why some artists can still show track names even when the first Spotify endpoint does not return enough data.

## How Buildings Represent Listening

- `Building height`: mainly driven by how much you listen to that artist (`plays`), with additional recency influence
- `Building width / podium size`: influenced by artist-detail values and style variation
- `Genre palette`: controls the building color family
- `Time slider`: changes the skyline scale so the city responds over the timeline
- `Beat pulse`: slightly animates tower lift when preview playback is active

## Local Setup

1. Copy `.env.example` to `.env.local`
2. Set `VITE_SPOTIFY_CLIENT_ID` to your Spotify app client ID
3. Optionally set `VITE_SPOTIFY_REDIRECT_URI`
4. Start the app with your normal Vite workflow

If `VITE_SPOTIFY_REDIRECT_URI` is not set, the app uses `window.location.origin + "/"`.

## Spotify Dashboard Setup

In the Spotify Developer Dashboard for your app:

1. Add your deployment URL as a Redirect URI
   Example: `https://your-domain.com/`
2. If the app is still in development mode, add each test Spotify account under the allowed users section
3. Make sure you log into Spotify with one of those allowed accounts

