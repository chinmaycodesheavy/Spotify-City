
import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || "";
const REDIRECT_URI = typeof window !== "undefined"
  ? (import.meta.env.VITE_SPOTIFY_REDIRECT_URI || `${window.location.origin}/`)
  : (import.meta.env.VITE_SPOTIFY_REDIRECT_URI || "");
const SCOPES = "user-top-read user-read-recently-played user-read-private";
const BASE = "https://api.spotify.com/v1";

// ─── SPOTIFY AUTH (PKCE) ──────────────────────────────────────────────────────
async function generatePKCE() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return { verifier, challenge };
}

async function loginWithSpotify() {
  if (!CLIENT_ID) {
    throw new Error("Spotify is not configured. Set VITE_SPOTIFY_CLIENT_ID before deploying.");
  }
  const { verifier, challenge } = await generatePKCE();
  sessionStorage.setItem("pkce_verifier", verifier);
  console.info("Spotify login: redirect_uri=", REDIRECT_URI, "current_url=", window.location.href);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

async function exchangeToken(code) {
  console.info("Spotify exchange: code=", code, "redirect_uri=", REDIRECT_URI, "current_url=", window.location.href);
  const verifier = sessionStorage.getItem("pkce_verifier");
  if (!verifier) {
    window.history.replaceState({}, "", window.location.pathname);
    throw new Error("Token exchange failed: missing PKCE verifier. Please reconnect Spotify.");
  }

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  });

  const data = await res.json();
  window.history.replaceState({}, "", window.location.pathname);
  sessionStorage.removeItem("pkce_verifier");

  if (!res.ok) {
    console.error("Spotify token exchange failed", res.status, data);
    if (data.error === "invalid_grant") {
      throw new Error("Token exchange failed: invalid_grant. The authorization code is invalid, expired, or already used. Please reconnect Spotify.");
    }
    throw new Error("Token exchange failed: " + JSON.stringify(data));
  }

  if (data.access_token) {
    localStorage.setItem("spotify_token", data.access_token);
    if (data.refresh_token) localStorage.setItem("spotify_refresh", data.refresh_token);
    return data.access_token;
  }

  throw new Error("Token exchange failed: unexpected response " + JSON.stringify(data));
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("spotify_refresh");
  if (!refreshToken) return null;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
  });
  const data = await res.json();
  if (data.access_token) {
    localStorage.setItem("spotify_token", data.access_token);
    return data.access_token;
  }
  localStorage.removeItem("spotify_token");
  localStorage.removeItem("spotify_refresh");
  return null;
}

function getSpotifyErrorMessage(body) {
  try {
    const parsed = JSON.parse(body);
    return parsed?.error?.message || parsed?.error_description || body;
  } catch {
    return body;
  }
}

async function api(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    const body = await res.text();
    console.error(`Spotify API failed ${res.status} ${path}`, body);
    throw new Error("TOKEN_INVALID");
  }
  if (res.status === 403) {
    const body = await res.text();
    const message = getSpotifyErrorMessage(body);
    console.error(`Spotify API failed ${res.status} ${path}`, body);
    if (message.includes("Active premium subscription required for the owner of the app")) {
      throw new Error("APP_OWNER_PREMIUM_REQUIRED");
    }
    if (message.includes("registered") && message.includes("Developer Dashboard")) {
      throw new Error("APP_USER_NOT_WHITELISTED");
    }
    throw new Error(`SPOTIFY_FORBIDDEN:${path}:${message}`);
  }
  if (!res.ok) {
    const body = await res.text();
    console.error(`Spotify API failed ${res.status} ${path}`, body);
    throw new Error(`API error ${res.status}: ${path}`);
  }
  return res.json();
}

// ─── GENRE MAPPING ────────────────────────────────────────────────────────────
function mapGenre(raw = "") {
  const g = raw.toLowerCase();
  if (g.match(/electronic|house|techno|edm|ambient|dnb|drum|bass|synth|trance|rave/)) return "electronic";
  if (g.match(/hip.hop|rap|trap|drill|grime|cloud rap/)) return "hiphop";
  if (g.match(/indie|alternative|lo.fi|bedroom|folk|singer.songwriter|shoegaze|emo/)) return "indie";
  if (g.match(/classical|orchestral|piano|chamber|opera|baroque/)) return "classical";
  if (g.match(/pop|r.b|soul|funk|disco|dance pop/)) return "pop";
  if (g.match(/jazz|blues|swing|bossa|afrobeat|latin/)) return "jazz";
  return "indie";
}

function generateBadges(artists, recentItems) {
  const badges = [];
  const nightPlays = recentItems.filter(item => {
    const h = new Date(item.played_at).getHours();
    return h >= 22 || h <= 3;
  }).length;
  if (nightPlays > recentItems.length * 0.25) badges.push("Night Owl 🦉");
  const genres = new Set(artists.map(a => mapGenre(a.genres?.[0] || "")));
  if (genres.size >= 4) badges.push("Genre Explorer 🗺️");
  const artistCounts = {};
  recentItems.forEach(i => {
    const id = i.track.artists[0]?.id;
    if (id) artistCounts[id] = (artistCounts[id] || 0) + 1;
  });
  const maxPlays = Math.max(0, ...Object.values(artistCounts));
  if (maxPlays > 8) badges.push("Loop Addict 🔁");
  if (artists.some(a => (a.popularity || 0) < 40)) badges.push("Underground Scout 🔍");
  if (badges.length === 0) badges.push("Music Lover 🎵");
  return badges;
}

// ─── DATA BUILDER ─────────────────────────────────────────────────────────────
async function buildCityData(token) {
  const [userRes, topArtistsLong, topArtistsMedium, recentRes] = await Promise.all([
    api("/me", token),
    api("/me/top/artists?limit=20&time_range=long_term", token),
    api("/me/top/artists?limit=20&time_range=medium_term", token),
    api("/me/player/recently-played?limit=50", token),
  ]);

  const topArtists = topArtistsLong.items.length >= 5
    ? topArtistsLong.items
    : topArtistsMedium.items;

  const recentCounts = {};
  const recentDays = {};
  recentRes.items.forEach(item => {
    const artistId = item.track.artists[0]?.id;
    if (!artistId) return;
    recentCounts[artistId] = (recentCounts[artistId] || 0) + 1;
    if (!recentDays[artistId]) {
      recentDays[artistId] = Math.max(0, Math.floor((Date.now() - new Date(item.played_at)) / 86400000));
    }
  });

  const topTracksResults = await Promise.allSettled(
    topArtists.slice(0, 15).map(a =>
      api(`/artists/${a.id}/top-tracks?market=${userRes.country || "US"}`, token)
    )
  );

  const topTrackIds = topTracksResults
    .map(r => r.status === "fulfilled" ? r.value?.tracks?.[0]?.id : null)
    .filter(Boolean);

  let featuresMap = {};
  if (topTrackIds.length > 0) {
    try {
      const featRes = await api(`/audio-features?ids=${topTrackIds.join(",")}`, token);
      featRes.audio_features?.forEach(f => { if (f) featuresMap[f.id] = f; });
    } catch (e) { /* audio features optional */ }
  }

  const artists = topArtists.slice(0, 15).map((artist, i) => {
    const trackResult = topTracksResults[i];
    const topTrack = trackResult?.status === "fulfilled" ? trackResult.value?.tracks?.[0] : null;
    const features = topTrack ? (featuresMap[topTrack.id] || {}) : {};
    const genre = mapGenre(artist.genres?.[0] || "pop");
    const rankScore = (15 - i) / 15;
    const recentBoost = Math.min(1, (recentCounts[artist.id] || 0) / 10);
    const angle = (i / 15) * Math.PI * 5;
    const radius = 2 + i * 0.5;
    return {
      id: artist.id,
      name: artist.name,
      genre,
      genreRaw: artist.genres?.[0] || "pop",
      plays: recentCounts[artist.id] || Math.floor(rankScore * 40),
      height: 3 + rankScore * 8 + recentBoost * 2,
      energy: features.energy ?? (0.4 + Math.random() * 0.4),
      danceability: features.danceability ?? (0.4 + Math.random() * 0.4),
      valence: features.valence ?? (0.3 + Math.random() * 0.5),
      popularity: artist.popularity,
      followers: artist.followers?.total || 0,
      lastPlayed: recentDays[artist.id] ?? 30,
      topTrack: topTrack?.name ?? "—",
      previewUrl: topTrack?.preview_url ?? null,
      imageUrl: artist.images?.[0]?.url ?? null,
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
    };
  });

  return {
    user: {
      name: userRes.display_name || "Listener",
      avatar: userRes.images?.[0]?.url,
      topGenre: topArtists[0]?.genres?.[0] || "music",
      totalHours: Math.floor(recentRes.items.length * 3.2),
      listeningStreak: Object.keys(recentCounts).length,
      discoveryRate: topArtists.filter(a => (a.popularity || 0) < 50).length / Math.max(1, topArtists.length),
      badges: generateBadges(topArtists, recentRes.items),
    },
    artists,
  };
}

// ─── VISUAL CONFIG ────────────────────────────────────────────────────────────
const GENRES = {
  electronic: { color: "#00f5ff", accent: "#7b2fff", label: "Electronic", emoji: "⚡" },
  hiphop:     { color: "#ff6b00", accent: "#ff2d55", label: "Hip-Hop",    emoji: "🎤" },
  indie:      { color: "#a8ff78", accent: "#78ffd6", label: "Indie",      emoji: "🌿" },
  classical:  { color: "#ffd700", accent: "#fff3b0", label: "Classical",  emoji: "🎻" },
  pop:        { color: "#ff69b4", accent: "#ff1493", label: "Pop",        emoji: "✨" },
  jazz:       { color: "#c77dff", accent: "#9d4edd", label: "Jazz",       emoji: "🎷" },
};

const SCALE = 42;
function toIso(x, z) {
  return {
    left: (x - z) * SCALE * 0.866,
    top:  (x + z) * SCALE * 0.5,
  };
}

// ─── BUILDING ─────────────────────────────────────────────────────────────────
function Building({ artist, selected, hovered, onHover, onLeave, onClick, beatPulse, timeMultiplier }) {
  const genre = GENRES[artist.genre] || GENRES.indie;
  const glowIntensity = Math.max(0.2, 1 - artist.lastPlayed / 30);
  const width = 26 + artist.popularity * 0.16;
  const bounce = artist.danceability * beatPulse * 10;
  const height = artist.height * timeMultiplier * 36 + beatPulse * artist.energy * 14;
  const iso = toIso(artist.x, artist.z);
  const isActive = selected?.id === artist.id || hovered?.id === artist.id;

  return (
    <div
      style={{
        position: "absolute", left: "50%", top: "50%",
        transform: `translate(${iso.left}px, ${iso.top - bounce}px)`,
        cursor: "pointer",
        zIndex: Math.floor((artist.x + artist.z) * 10 + 100),
        transition: "transform 0.08s ease",
      }}
      onMouseEnter={() => onHover(artist)}
      onMouseLeave={onLeave}
      onClick={() => onClick(artist)}
    >
      <div style={{ position:"absolute", bottom:-6, left:"50%", transform:"translateX(-50%)", width:width*1.5, height:width*0.5, background:"rgba(0,0,0,0.4)", borderRadius:"50%", filter:"blur(8px)" }} />
      <div style={{ position:"absolute", bottom:0, left:0, width:width*0.5, height, background:`linear-gradient(to bottom,${genre.color}55,${genre.color}11)`, borderLeft:`1px solid ${genre.color}55`, transform:"skewY(-30deg)", transformOrigin:"bottom left", transition:"height 0.4s ease" }} />
      <div style={{ position:"absolute", bottom:0, left:width*0.5, width:width*0.5, height:height*0.85, background:`linear-gradient(to bottom,${genre.accent}33,${genre.accent}08)`, borderRight:`1px solid ${genre.accent}55`, transform:"skewY(30deg)", transformOrigin:"bottom right", transition:"height 0.4s ease" }} />
      <div style={{ position:"absolute", bottom:height-2, left:0, width, height:width*0.3, background:`linear-gradient(135deg,${genre.color}cc,${genre.accent}88)`, transform:"skewX(-30deg) scaleY(0.6)", transformOrigin:"bottom center", boxShadow: isActive ? `0 0 30px ${genre.color},0 0 60px ${genre.color}44` : `0 0 ${10*glowIntensity}px ${genre.color}66`, transition:"box-shadow 0.3s ease, bottom 0.4s ease" }} />
      {Array.from({ length: Math.min(Math.floor(height / 24), 12) }).map((_, i) => (
        <div key={i} style={{ position:"absolute", bottom:10+i*24, left:width*0.1, width:width*0.3, height:10, background: Math.sin(i*7+artist.popularity)>0.2 ? `${genre.color}bb` : `${genre.color}22`, boxShadow:`0 0 5px ${genre.color}66`, animation:`winkWin ${1.5+(i%4)}s infinite ${(i*0.4)%2}s` }} />
      ))}
      {glowIntensity > 0.5 && (
        <div style={{ position:"absolute", bottom:height+2, left:"50%", transform:"translateX(-50%)", width:3, height:50, background:`linear-gradient(to top,${genre.color}cc,transparent)`, filter:"blur(2px)", animation:`beacon ${0.4+artist.energy*1.8}s infinite alternate` }} />
      )}
      {isActive && (
        <div style={{ position:"absolute", bottom:height+16, left:"50%", transform:"translateX(-50%)", whiteSpace:"nowrap", color:"#fff", fontSize:11, fontFamily:"monospace", fontWeight:"bold", background:"rgba(0,0,0,0.88)", padding:"3px 10px", borderRadius:4, border:`1px solid ${genre.color}55`, boxShadow:`0 0 10px ${genre.color}44`, textShadow:`0 0 8px ${genre.color}`, letterSpacing:0.5 }}>
          {artist.name}
        </div>
      )}
    </div>
  );
}

function Road({ from, to }) {
  const f = toIso(from.x, from.z), t = toIso(to.x, to.z);
  const dx = t.left-f.left, dy = t.top-f.top;
  const len = Math.sqrt(dx*dx+dy*dy);
  const angle = Math.atan2(dy, dx) * (180/Math.PI);
  return (
    <div
      style={{
        position: "absolute",
        left: `calc(50% + ${f.left}px)`,
        top: `calc(50% + ${f.top - 6}px)`,
        width: len,
        height: 12,
        transform: `rotate(${angle}deg)`,
        transformOrigin: "0 50%",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 999,
          background: "linear-gradient(to right, rgba(0,0,0,0), rgba(18,24,42,0.92) 12%, rgba(18,24,42,0.92) 88%, rgba(0,0,0,0))",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          borderBottom: "1px solid rgba(0,0,0,0.45)",
          boxShadow: "0 0 18px rgba(0,245,255,0.16)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "12%",
          right: "12%",
          top: "50%",
          height: 2,
          transform: "translateY(-50%)",
          borderRadius: 999,
          background: "repeating-linear-gradient(to right, rgba(0,245,255,0.85) 0 16px, rgba(0,245,255,0.08) 16px 30px)",
          boxShadow: "0 0 10px rgba(0,245,255,0.45)",
          opacity: 0.8,
        }}
      />
    </div>
  );
}

// ─── ARTIST CARD ──────────────────────────────────────────────────────────────
function ArtistCard({ artist, onClose, onPlay }) {
  if (!artist) return null;
  const genre = GENRES[artist.genre] || GENRES.indie;
  return (
    <div style={{ position:"fixed", right:24, top:"50%", transform:"translateY(-50%)", width:280, background:"rgba(5,5,14,0.97)", border:`1px solid ${genre.color}44`, borderRadius:14, padding:24, fontFamily:"monospace", zIndex:500, boxShadow:`0 0 50px ${genre.color}18`, backdropFilter:"blur(20px)", animation:"slideIn 0.2s ease" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {artist.imageUrl && <img src={artist.imageUrl} alt="" style={{ width:42, height:42, borderRadius:"50%", border:`2px solid ${genre.color}66`, objectFit:"cover" }} />}
          <div>
            <div style={{ color:genre.color, fontSize:16, fontWeight:"bold", textShadow:`0 0 10px ${genre.color}` }}>{artist.name}</div>
            <div style={{ color:"#ffffff55", fontSize:10, marginTop:2 }}>{genre.emoji} {genre.label}</div>
          </div>
        </div>
        <button onClick={onClose} style={{ background:"none", border:"1px solid #ffffff22", color:"#ffffff55", cursor:"pointer", padding:"2px 8px", borderRadius:4, fontSize:12 }}>✕</button>
      </div>
      {[
        { label:"ENERGY",       value:artist.energy,           color:"#ff2d55" },
        { label:"DANCEABILITY", value:artist.danceability,     color:"#00f5ff" },
        { label:"VALENCE",      value:artist.valence,          color:"#ffd700" },
        { label:"POPULARITY",   value:artist.popularity/100,   color:genre.color },
      ].map(s => (
        <div key={s.label} style={{ marginBottom:9 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
            <span style={{ color:"#ffffff44", fontSize:9, letterSpacing:1 }}>{s.label}</span>
            <span style={{ color:s.color, fontSize:9 }}>{Math.round(s.value*100)}%</span>
          </div>
          <div style={{ height:3, background:"#ffffff0f", borderRadius:2 }}>
            <div style={{ height:"100%", width:`${s.value*100}%`, background:`linear-gradient(to right,${s.color}77,${s.color})`, borderRadius:2, boxShadow:`0 0 5px ${s.color}`, transition:"width 0.6s ease" }} />
          </div>
        </div>
      ))}
      <div style={{ borderTop:"1px solid #ffffff0f", marginTop:16, paddingTop:14 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
          {[
            { label:"RECENT PLAYS", value: artist.plays || "—" },
            { label:"FOLLOWERS",    value: artist.followers > 1e6 ? `${(artist.followers/1e6).toFixed(1)}M` : `${Math.floor(artist.followers/1e3)}K` },
            { label:"LAST PLAYED",  value: artist.lastPlayed <= 1 ? "Today" : `${artist.lastPlayed}d ago` },
            { label:"TOP TRACK",    value: artist.topTrack },
          ].map(item => (
            <div key={item.label}>
              <div style={{ color:"#ffffff22", fontSize:8, letterSpacing:1 }}>{item.label}</div>
              <div style={{ color:"#ffffffcc", fontSize:11, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.value}</div>
            </div>
          ))}
        </div>
        <button onClick={() => onPlay(artist)} style={{ width:"100%", background: artist.previewUrl ? `linear-gradient(135deg,${genre.color}33,${genre.accent}22)` : "#ffffff08", border:`1px solid ${artist.previewUrl ? genre.color+"66" : "#ffffff11"}`, color: artist.previewUrl ? genre.color : "#ffffff33", padding:"10px 0", borderRadius:8, cursor: artist.previewUrl ? "pointer" : "default", fontFamily:"monospace", fontSize:11, letterSpacing:1, fontWeight:"bold" }}>
          {artist.previewUrl ? `▶ PLAY: ${artist.topTrack.slice(0,22)}` : "⊘ NO PREVIEW AVAILABLE"}
        </button>
      </div>
    </div>
  );
}

// ─── MINI MAP ─────────────────────────────────────────────────────────────────
function MiniMap({ artists, selected }) {
  const size = 140, pad = 14, inner = size - pad*2;
  if (!artists.length) return null;
  const xs = artists.map(a=>a.x), zs = artists.map(a=>a.z);
  const [minX,maxX,minZ,maxZ] = [Math.min(...xs),Math.max(...xs),Math.min(...zs),Math.max(...zs)];
  const rX = maxX-minX||1, rZ = maxZ-minZ||1;
  const toMap = (x,z) => ({ x:((x-minX)/rX)*inner+pad, y:((z-minZ)/rZ)*inner+pad });
  return (
    <div style={{ position:"fixed", bottom:24, right:24, width:size, height:size, background:"rgba(4,4,12,0.93)", border:"1px solid #ffffff0f", borderRadius:10, overflow:"hidden", backdropFilter:"blur(10px)" }}>
      <div style={{ position:"absolute", top:6, left:8, color:"#ffffff22", fontSize:8, letterSpacing:1, fontFamily:"monospace" }}>CITY MAP</div>
      <svg width={size} height={size} style={{ position:"absolute" }}>
        {artists.map(a => {
          const p = toMap(a.x,a.z), g = GENRES[a.genre]||GENRES.indie, isSel = selected?.id===a.id;
          return <circle key={a.id} cx={p.x} cy={p.y} r={isSel?5:2+a.height*0.15} fill={g.color} opacity={isSel?1:0.6} style={{ filter:isSel?`drop-shadow(0 0 4px ${g.color})`:"none" }} />;
        })}
      </svg>
    </div>
  );
}

// ─── STATS PANEL ─────────────────────────────────────────────────────────────
function StatsPanel({ user }) {
  if (!user) return null;
  return (
    <div style={{ position:"fixed", left:24, top:"50%", transform:"translateY(-50%)", width:196, fontFamily:"monospace", zIndex:100 }}>
      <div style={{ background:"rgba(5,5,14,0.94)", border:"1px solid #00f5ff1a", borderRadius:12, padding:16, marginBottom:10, backdropFilter:"blur(20px)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          {user.avatar
            ? <img src={user.avatar} alt="" style={{ width:40, height:40, borderRadius:"50%", border:"2px solid #00f5ff44", objectFit:"cover" }} />
            : <div style={{ width:40, height:40, borderRadius:"50%", background:"linear-gradient(135deg,#00f5ff,#7b2fff)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>{user.name[0]}</div>
          }
          <div>
            <div style={{ color:"#fff", fontSize:13, fontWeight:"bold" }}>{user.name}</div>
            <div style={{ color:"#00f5ff", fontSize:9, letterSpacing:1 }}>SPOTIFY CITY 2026</div>
          </div>
        </div>
        {[
          { label:"HOURS (EST.)", value:user.totalHours+"h",                       color:"#00f5ff" },
          { label:"RECENT ARTISTS", value:user.listeningStreak+" active",          color:"#ff6b00" },
          { label:"UNDERGROUND",   value:Math.round(user.discoveryRate*100)+"%",   color:"#a8ff78" },
          { label:"TOP GENRE",     value:user.topGenre,                             color:"#7b2fff" },
        ].map(s => (
          <div key={s.label} style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
            <span style={{ color:"#ffffff33", fontSize:9, letterSpacing:1 }}>{s.label}</span>
            <span style={{ color:s.color, fontSize:10, fontWeight:"bold", maxWidth:110, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.value}</span>
          </div>
        ))}
      </div>
      <div style={{ background:"rgba(5,5,14,0.94)", border:"1px solid #ffffff0f", borderRadius:12, padding:12, marginBottom:10, backdropFilter:"blur(20px)" }}>
        <div style={{ color:"#ffffff33", fontSize:9, letterSpacing:1, marginBottom:8 }}>BADGES</div>
        {user.badges.map(b => <div key={b} style={{ color:"#ffffffbb", fontSize:10, padding:"3px 0", borderBottom:"1px solid #ffffff08" }}>{b}</div>)}
      </div>
      <div style={{ background:"rgba(5,5,14,0.94)", border:"1px solid #ffffff0f", borderRadius:12, padding:12, backdropFilter:"blur(20px)" }}>
        <div style={{ color:"#ffffff33", fontSize:9, letterSpacing:1, marginBottom:8 }}>DISTRICTS</div>
        {Object.entries(GENRES).map(([k,g]) => (
          <div key={k} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5 }}>
            <div style={{ width:7, height:7, borderRadius:1, background:g.color, boxShadow:`0 0 5px ${g.color}` }} />
            <span style={{ color:"#ffffffaa", fontSize:10 }}>{g.emoji} {g.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── NOW PLAYING ──────────────────────────────────────────────────────────────
function NowPlaying({ artist, isPlaying, onToggle }) {
  if (!artist) return null;
  const genre = GENRES[artist.genre] || GENRES.indie;
  return (
    <div style={{ position:"fixed", bottom:76, left:"50%", transform:"translateX(-50%)", background:"rgba(5,5,14,0.97)", border:`1px solid ${genre.color}44`, borderRadius:40, padding:"8px 20px 8px 12px", display:"flex", alignItems:"center", gap:12, backdropFilter:"blur(20px)", fontFamily:"monospace", zIndex:100, boxShadow:`0 0 30px ${genre.color}22`, animation:"fadeUp 0.3s ease" }}>
      {artist.imageUrl
        ? <img src={artist.imageUrl} alt="" style={{ width:32, height:32, borderRadius:"50%", objectFit:"cover", border:`2px solid ${genre.color}66`, animation:isPlaying?"spin 4s linear infinite":"none" }} />
        : <div style={{ width:32, height:32, borderRadius:"50%", background:`linear-gradient(135deg,${genre.color},${genre.accent})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, animation:isPlaying?"spin 4s linear infinite":"none" }}>{genre.emoji}</div>
      }
      <div>
        <div style={{ color:"#ffffffcc", fontSize:11, fontWeight:"bold" }}>{artist.topTrack}</div>
        <div style={{ color:genre.color, fontSize:9 }}>{artist.name}</div>
      </div>
      <div style={{ display:"flex", gap:2, alignItems:"flex-end", height:16 }}>
        {[0.6,1,0.7,0.9,0.5].map((h,i) => (
          <div key={i} style={{ width:3, height:isPlaying?`${h*16}px`:"4px", background:genre.color, borderRadius:2, animation:isPlaying?`eq ${0.3+i*0.1}s infinite alternate`:"none", transition:"height 0.3s ease" }} />
        ))}
      </div>
      <button onClick={onToggle} style={{ background:"none", border:`1px solid ${genre.color}55`, color:genre.color, cursor:"pointer", width:24, height:24, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10 }}>
        {isPlaying ? "⏸" : "▶"}
      </button>
    </div>
  );
}

// ─── TIME SLIDER ──────────────────────────────────────────────────────────────
function TimeSlider({ value, onChange }) {
  const labels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return (
    <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", background:"rgba(5,5,14,0.94)", border:"1px solid #ffffff0f", borderRadius:30, padding:"10px 20px", display:"flex", alignItems:"center", gap:12, backdropFilter:"blur(20px)", fontFamily:"monospace", zIndex:100 }}>
      <span style={{ color:"#ffffff33", fontSize:10 }}>⏪</span>
      <input type="range" min={0} max={11} value={value} onChange={e => onChange(Number(e.target.value))} style={{ width:150, accentColor:"#00f5ff", cursor:"pointer" }} />
      <span style={{ color:"#00f5ff", fontSize:11, minWidth:36, fontWeight:"bold" }}>{labels[value]} '25</span>
    </div>
  );
}

// ─── LOADING ──────────────────────────────────────────────────────────────────
function LoadingScreen({ progress }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"radial-gradient(ellipse at 50% 120%,#0a0020,#000)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"monospace", zIndex:3000 }}>
      <div style={{ fontSize:11, letterSpacing:4, color:"#00f5ff88", marginBottom:20 }}>◈ SPOTIFY CITY</div>
      <div style={{ color:"#fff", fontSize:22, fontWeight:"bold", marginBottom:8 }}>Building Your City...</div>
      <div style={{ color:"#ffffff44", fontSize:12, marginBottom:32 }}>{progress}</div>
      <div style={{ width:240, height:2, background:"#ffffff0f", borderRadius:2 }}>
        <div style={{ height:"100%", background:"linear-gradient(to right,#00f5ff,#7b2fff)", borderRadius:2, animation:"loadBar 1.4s infinite alternate", boxShadow:"0 0 10px #00f5ff" }} />
      </div>
    </div>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, error }) {
  const [hov, setHov] = useState(false);
  const [origin, setOrigin] = useState("");
  const missingConfig = !CLIENT_ID;
  useEffect(() => { setOrigin(window.location.origin); }, []);
  return (
    <div style={{ position:"fixed", inset:0, background:"radial-gradient(ellipse at 50% 120%,#0a0020 0%,#000 60%)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"monospace", overflow:"hidden" }}>
      <div style={{ position:"absolute", bottom:0, left:0, right:0, height:"45%", backgroundImage:`linear-gradient(rgba(0,245,255,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,255,0.06) 1px,transparent 1px)`, backgroundSize:"60px 60px", transform:"perspective(600px) rotateX(60deg)", transformOrigin:"bottom center" }} />
      {Array.from({length:40}).map((_,i) => (
        <div key={i} style={{ position:"absolute", width:1, height:1, borderRadius:"50%", background:"#fff", opacity:0.1+(i%5)*0.08, left:`${(i*8.3)%100}%`, top:`${(i*5.7)%60}%`, animation:`float ${2+(i%4)}s infinite alternate ${i*0.2}s` }} />
      ))}
      <div style={{ display:"flex", alignItems:"flex-end", gap:3, marginBottom:48 }}>
        {[28,55,82,120,75,105,65,48,90,42,70,95,52].map((h,i) => (
          <div key={i} style={{ width:14+(i%3)*5, height:h, background:`linear-gradient(to top,transparent,${["#00f5ff","#7b2fff","#ff2d55","#ffd700","#ff6b00"][i%5]}44)`, border:`1px solid ${["#00f5ff","#7b2fff","#ff2d55","#ffd700","#ff6b00"][i%5]}33`, boxShadow:`0 0 ${8+h*0.1}px ${["#00f5ff","#7b2fff","#ff2d55","#ffd700","#ff6b00"][i%5]}33`, borderRadius:"1px 1px 0 0", animation:`rise ${0.3+i*0.07}s ease-out both` }} />
        ))}
      </div>
      <div style={{ fontSize:11, letterSpacing:6, color:"#00f5ff77", marginBottom:12 }}>◈ SPOTIFY CITY</div>
      <div style={{ fontSize:48, fontWeight:900, letterSpacing:-2, lineHeight:1, marginBottom:8, textAlign:"center", background:"linear-gradient(135deg,#fff,#00f5ff,#7b2fff)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
        Your Music.<br />Your City.
      </div>
      <div style={{ color:"#ffffff44", fontSize:13, marginBottom:48, textAlign:"center", lineHeight:1.7 }}>
        A living 3D city built from your real<br />Spotify listening history.
      </div>
      <div style={{ color:"#ffffff55", fontSize:10, marginBottom:10, textAlign:"center", maxWidth:360 }}>
        Redirect URI: <strong style={{ color:"#00f5ff" }}>{origin ? `${origin}/` : "loading..."}</strong>
      </div>
      {error && <div style={{ color:"#ff2d55", fontSize:11, marginBottom:16, background:"#ff2d5511", padding:"8px 16px", borderRadius:8, border:"1px solid #ff2d5533" }}>⚠ {error}</div>}
      <button onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} onClick={onLogin} disabled={missingConfig}
        style={{ background:hov && !missingConfig?"linear-gradient(135deg,#1db954,#1ed760)":"linear-gradient(135deg,#1db95422,#1ed76022)", border:`1px solid ${hov && !missingConfig?"#1db954":"#1db95444"}`, color:hov && !missingConfig?"#000":"#1db954", padding:"16px 48px", borderRadius:40, cursor:missingConfig?"not-allowed":"pointer", fontFamily:"monospace", fontSize:14, fontWeight:"bold", letterSpacing:2, boxShadow:hov && !missingConfig?"0 0 40px #1db95466":"0 0 20px #1db95422", transition:"all 0.3s ease", opacity:missingConfig?0.6:1 }}>
        ▶ CONNECT SPOTIFY
      </button>
      <button onClick={() => { localStorage.clear(); sessionStorage.clear(); window.location.reload(); }}
        style={{ marginTop:12, background:"none", border:"1px solid #ffffff22", color:"#ffffff55", padding:"10px 22px", borderRadius:30, cursor:"pointer", fontFamily:"monospace", fontSize:11, letterSpacing:1 }}>
        Reset login state
      </button>
      <div style={{ color:"#ffffff22", fontSize:10, marginTop:16, letterSpacing:1 }}>Uses read-only access · No data stored</div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function SpotifyCity() {
  const [phase, setPhase]               = useState("boot");
  const [cityData, setCityData]         = useState(null);
  const [loadProgress, setLoadProgress] = useState("Connecting...");
  const [authError, setAuthError]       = useState(null);
  const [selectedArtist, setSelected]   = useState(null);
  const [hoveredArtist, setHovered]     = useState(null);
  const [playingArtist, setPlaying]     = useState(null);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [beatPulse, setBeatPulse]       = useState(0);
  const [timeSlider, setTimeSlider]     = useState(11);
  const [camOffset, setCamOffset]       = useState({ x:0, y:0 });
  const [dragging, setDragging]         = useState(false);
  const [dragStart, setDragStart]       = useState({ x:0, y:0 });
  const [zoom, setZoom]                 = useState(1);
  const [showHelp, setShowHelp]         = useState(true);
  const audioRef = useRef(null);
  const beatRef  = useRef(null);
  const authStarted = useRef(false);
  const handleSpotifyLoadError = useCallback((err) => {
    localStorage.removeItem("spotify_token");
    localStorage.removeItem("spotify_refresh");

    if (err.message === "TOKEN_INVALID") {
      setPhase("login");
      return;
    }

    if (err.message === "APP_OWNER_PREMIUM_REQUIRED") {
      setAuthError("Spotify rejected these API calls because the Spotify account that owns this app does not currently have an active Premium subscription. Upgrade the app-owner account to Premium, wait a few hours, then reconnect.");
      setPhase("login");
      return;
    }

    if (err.message === "APP_USER_NOT_WHITELISTED") {
      setAuthError("Spotify rejected this account because the app appears to be in development mode and this Spotify user is not added in the Developer Dashboard users list.");
      setPhase("login");
      return;
    }

    if (err.message.startsWith("SPOTIFY_FORBIDDEN:")) {
      const details = err.message.slice("SPOTIFY_FORBIDDEN:".length);
      const firstSeparator = details.indexOf(":");
      const path = firstSeparator >= 0 ? details.slice(0, firstSeparator) : details;
      const message = firstSeparator >= 0 ? details.slice(firstSeparator + 1) : "Spotify returned 403 Forbidden.";
      setAuthError(`Spotify denied ${path}. ${message}`);
      setPhase("login");
      return;
    }

    setAuthError("Failed to load: " + err.message);
    setPhase("login");
  }, []);

  // Boot: check for OAuth code or existing token
  useEffect(() => {
    if (authStarted.current) return;
    authStarted.current = true;

    const searchParams = new URLSearchParams(window.location.search);
    const code  = searchParams.get("code");
    const token = localStorage.getItem("spotify_token");

    if (code) {
      const cleanUrl = `${window.location.origin}${window.location.pathname}`;
      window.history.replaceState({}, "", cleanUrl);
      setPhase("loading"); setLoadProgress("Exchanging auth token...");
      exchangeToken(code).then(loadCity).catch(e => {
        if (e.message.includes("invalid_grant") || e.message.includes("missing PKCE verifier")) {
          localStorage.removeItem("spotify_token");
          localStorage.removeItem("spotify_refresh");
        }
        setAuthError(e.message);
        setPhase("login");
      });
    } else if (token) {
      setPhase("loading"); setLoadProgress("Loading your city...");
      loadCity(token).catch(() =>
        refreshAccessToken().then(t => {
          if (!t) {
            setPhase("login");
            return null;
          }
          return loadCity(t).catch(err => {
            if (err.message === "TOKEN_EXPIRED") throw err;
            handleSpotifyLoadError(err);
            return null;
          });
        })
      );
    } else {
      setPhase("login");
    }
  }, [handleSpotifyLoadError]);

  async function loadCity(token) {
    try {
      setLoadProgress("Fetching your top artists...");
      await new Promise(r => setTimeout(r, 300));
      setLoadProgress("Mapping audio features...");
      const data = await buildCityData(token);
      setLoadProgress("Constructing buildings...");
      await new Promise(r => setTimeout(r, 400));
      setCityData(data);
      setPhase("city");
      setTimeout(() => setShowHelp(false), 5000);
    } catch (err) {
      if (err.message === "TOKEN_EXPIRED") throw err;
      handleSpotifyLoadError(err);
    }
  }

  // Beat pulse when playing
  useEffect(() => {
    if (!isPlaying || !playingArtist) { setBeatPulse(0); return; }
    const bpm = 70 + playingArtist.energy * 90;
    const ms  = 60000 / bpm;
    beatRef.current = setInterval(() => {
      setBeatPulse(1);
      setTimeout(() => setBeatPulse(0), ms * 0.25);
    }, ms);
    return () => clearInterval(beatRef.current);
  }, [isPlaying, playingArtist]);

  const handlePlay = useCallback((artist) => {
    if (!artist.previewUrl) return;
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.pause();
    audioRef.current.src = artist.previewUrl;
    audioRef.current.play().catch(()=>{});
    audioRef.current.onended = () => setIsPlaying(false);
    setPlaying(artist); setIsPlaying(true);
  }, []);

  const handleToggle = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
    else           { audioRef.current.play().catch(()=>{}); setIsPlaying(true); }
  }, [isPlaying]);

  const onMouseDown = e => { setDragging(true); setDragStart({ x:e.clientX-camOffset.x, y:e.clientY-camOffset.y }); };
  const onMouseMove = e => { if (dragging) setCamOffset({ x:e.clientX-dragStart.x, y:e.clientY-dragStart.y }); };
  const onMouseUp   = () => setDragging(false);
  const onWheel     = e => { e.preventDefault(); setZoom(z => Math.max(0.35, Math.min(2.8, z - e.deltaY*0.001))); };

  const timeMultiplier = 0.45 + (timeSlider/11)*0.55;
  const artists = cityData?.artists ?? [];
  const roads = artists.length > 1
    ? artists.slice(0,-1).map((a,i)=>[a,artists[i+1]]).filter((_,i)=>i%2===0)
    : [];

  const CSS = `
    @keyframes winkWin{0%,94%{opacity:1}95%,100%{opacity:.2}}
    @keyframes beacon{from{opacity:.3;height:35px}to{opacity:.9;height:75px}}
    @keyframes eq{from{transform:scaleY(.4)}to{transform:scaleY(1.3)}}
    @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
    @keyframes float{from{transform:translateY(0);opacity:.4}to{transform:translateY(-18px);opacity:.9}}
    @keyframes slideIn{from{opacity:0;transform:translateY(-50%) translateX(20px)}to{opacity:1;transform:translateY(-50%) translateX(0)}}
    @keyframes fadeUp{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
    @keyframes loadBar{from{width:20%}to{width:90%}}
    @keyframes rise{from{transform:scaleY(0);opacity:0}to{transform:scaleY(1);opacity:1}}
    *{box-sizing:border-box} ::-webkit-scrollbar{display:none}
  `;

  if (phase === "boot")    return <div style={{background:"#000",width:"100vw",height:"100vh"}}><style>{CSS}</style></div>;
  if (phase === "login")   return <><style>{CSS}</style><LoginScreen onLogin={loginWithSpotify} error={authError} /></>;
  if (phase === "loading") return <><style>{CSS}</style><LoadingScreen progress={loadProgress} /></>;

  return (
    <div style={{ width:"100vw", height:"100vh", background:"#060610", overflow:"hidden" }}>
      <style>{CSS}</style>

      {/* Atmosphere layers */}
      <div style={{ position:"fixed", inset:0, background:"radial-gradient(ellipse at 50% 120%,#0d001a,#060610 50%,#000)", pointerEvents:"none" }} />
      <div style={{ position:"fixed", inset:0, background:"radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.65) 100%)", pointerEvents:"none", zIndex:50 }} />
      <div style={{ position:"fixed", inset:0, background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.025) 2px,rgba(0,0,0,0.025) 4px)", pointerEvents:"none", zIndex:5 }} />

      {/* Stars */}
      {Array.from({length:50}).map((_,i) => (
        <div key={i} style={{ position:"fixed", width:i%6===0?2:1, height:i%6===0?2:1, background:"#fff", opacity:0.1+(i%5)*0.08, left:`${(i*7.1)%100}%`, top:`${(i*5.9)%50}%`, borderRadius:"50%", pointerEvents:"none", animation:`float ${2+(i%5)}s infinite alternate ${i*0.2}s` }} />
      ))}

      {/* City canvas */}
      <div style={{ position:"fixed", inset:0, cursor:dragging?"grabbing":"grab", zIndex:10 }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onWheel={onWheel}>
        <div style={{ position:"absolute", left:"50%", top:"55%", transform:`translate(-50%,-50%) translate(${camOffset.x}px,${camOffset.y}px) scale(${zoom})`, transformOrigin:"center center" }}>
          {/* Ground */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%,-50%)",
              width: 1160,
              height: 760,
              borderRadius: "50%",
              background: "radial-gradient(ellipse at center, rgba(16,34,50,0.95) 0%, rgba(8,14,24,0.92) 48%, rgba(2,4,10,0.25) 72%, rgba(0,0,0,0) 100%)",
              boxShadow: "0 0 120px rgba(0,245,255,0.08), inset 0 0 60px rgba(255,255,255,0.04)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%,-50%)",
              width: 980,
              height: 980,
              backgroundImage: "linear-gradient(rgba(0,245,255,0.08) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,255,0.08) 1px,transparent 1px)",
              backgroundSize: "42px 42px",
              maskImage: "radial-gradient(circle, black 0%, black 58%, transparent 82%)",
              WebkitMaskImage: "radial-gradient(circle, black 0%, black 58%, transparent 82%)",
              opacity: 0.65,
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%,-50%)",
              width: 1080,
              height: 1080,
              borderRadius: "50%",
              border: "1px solid rgba(0,245,255,0.12)",
              boxShadow: "0 0 50px rgba(0,245,255,0.08)",
              pointerEvents: "none",
            }}
          />
          {roads.map(([a,b],i) => <Road key={i} from={a} to={b} />)}
          {[...artists].sort((a,b)=>(a.x+a.z)-(b.x+b.z)).map(artist => (
            <Building key={artist.id} artist={artist}
              selected={selectedArtist} hovered={hoveredArtist}
              onHover={setHovered} onLeave={()=>setHovered(null)}
              onClick={a => { setSelected(p => p?.id===a.id ? null : a); setShowHelp(false); }}
              beatPulse={beatPulse} timeMultiplier={timeMultiplier} />
          ))}
        </div>
      </div>

      {/* UI overlays */}
      <StatsPanel user={cityData?.user} />
      <ArtistCard artist={selectedArtist} onClose={()=>setSelected(null)} onPlay={handlePlay} />
      <MiniMap artists={artists} selected={selectedArtist} />
      <TimeSlider value={timeSlider} onChange={setTimeSlider} />
      <NowPlaying artist={playingArtist} isPlaying={isPlaying} onToggle={handleToggle} />

      {/* Top bar */}
      <div style={{ position:"fixed", top:24, left:"50%", transform:"translateX(-50%)", display:"flex", alignItems:"center", gap:10, zIndex:200 }}>
        <div style={{ background:"rgba(5,5,14,0.94)", border:"1px solid #00f5ff1a", borderRadius:40, padding:"9px 20px", color:"#00f5ff", fontSize:12, fontFamily:"monospace", letterSpacing:2, backdropFilter:"blur(20px)", fontWeight:"bold", textShadow:"0 0 10px #00f5ff" }}>
          ◈ SPOTIFY CITY 2026
        </div>
        <div style={{ display:"flex", background:"rgba(5,5,14,0.94)", border:"1px solid #ffffff0f", borderRadius:40, backdropFilter:"blur(20px)", overflow:"hidden" }}>
          {[["−",-0.3],["+",0.3]].map(([l,d]) => (
            <button key={l} onClick={()=>setZoom(z=>Math.max(0.35,Math.min(2.8,z+d)))} style={{ background:"none", border:"none", color:"#ffffff55", cursor:"pointer", width:34, height:36, fontSize:18, fontFamily:"monospace" }}>{l}</button>
          ))}
          <button onClick={()=>{ setZoom(1); setCamOffset({x:0,y:0}); }} style={{ background:"none", border:"none", color:"#ffffff33", cursor:"pointer", fontSize:9, fontFamily:"monospace", padding:"0 10px" }}>RESET</button>
        </div>
        <button onClick={()=>{ localStorage.clear(); window.location.reload(); }}
          style={{ background:"rgba(5,5,14,0.94)", border:"1px solid #ff2d5522", borderRadius:40, padding:"9px 16px", color:"#ff2d5566", fontFamily:"monospace", fontSize:10, cursor:"pointer", backdropFilter:"blur(20px)", letterSpacing:1 }}>
          ⏏ LOGOUT
        </button>
      </div>

      {/* Help */}
      {showHelp && (
        <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"rgba(5,5,14,0.96)", border:"1px solid #00f5ff1a", borderRadius:12, padding:"16px 26px", fontFamily:"monospace", fontSize:11, color:"#ffffff55", textAlign:"center", zIndex:200, pointerEvents:"none", animation:"fadeUp 0.5s ease", lineHeight:1.9 }}>
          <div style={{ color:"#00f5ff", marginBottom:8, fontSize:13 }}>🏙️ Your city is ready</div>
          <div>🖱️ Drag to pan · Scroll to zoom</div>
          <div>🏢 Click a building to see artist stats</div>
          <div>⏪ Time slider shows your year in music</div>
        </div>
      )}
    </div>
  );
}
