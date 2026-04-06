# Spotify City

Spotify City is a React + Vite app that turns a user's Spotify listening data into a stylized neon city.

## Local setup

1. Copy `.env.example` to `.env.local`
2. Set `VITE_SPOTIFY_CLIENT_ID` to your Spotify app client ID
3. Optionally set `VITE_SPOTIFY_REDIRECT_URI`
4. Start the app with your normal Vite workflow

If `VITE_SPOTIFY_REDIRECT_URI` is not set, the app uses `window.location.origin + "/"`.

## Spotify dashboard setup

In the Spotify Developer Dashboard for your app:

1. Add your deployment URL as a Redirect URI
   Example: `https://your-domain.com/`
2. If the app is still in development mode, add each test Spotify account under the allowed users section
3. Make sure you log into Spotify with one of those allowed accounts

## Deploying

This app can be deployed as a static site on Vercel, Netlify, or Cloudflare Pages.

### Vercel

1. Import the repo into Vercel
2. Framework preset: `Vite`
3. Build command: `vite build`
4. Output directory: `dist`
5. Add environment variable:
   `VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id`
6. Optionally add:
   `VITE_SPOTIFY_REDIRECT_URI=https://your-domain.com/`
7. Redeploy

### Netlify

1. Import the repo into Netlify
2. Build command: `vite build`
3. Publish directory: `dist`
4. Add the same environment variables as above
5. Redeploy

## Sharing the app

Other people can only connect successfully if:

1. The redirect URI in Spotify matches the deployed site exactly
2. Their Spotify account is allowed in your Spotify app settings while the app is in development mode
3. The Spotify app itself is permitted to use the required endpoints for that user/app combination

## Notes

- Do not put a Spotify `client_secret` in this frontend app
- `VITE_` variables are exposed to the browser, so only public values like the Spotify client ID belong there
# Spotify-City
