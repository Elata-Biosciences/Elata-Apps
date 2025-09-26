# Elata Apps

The simplest way to run and deploy a single server that serves multiple browser apps.

- server/ → Node/Express + Socket.IO
- public/ → Static site root (landing + apps under public/apps)
- Apps talk to the server using either a simple relay (/relay) or the game engine (/game for Pong)

## Quickstart

Prereqs: Node 18+ (or 20+)

- Development (auto‑reload):
  - ./run dev
- Start normally:
  - ./run
- Tests:
  - ./run test

That’s it. Use ./run dev while coding (server restarts on file changes).

## Project layout

- public/
  - index.html – App Store landing
  - apps/… – Each app’s HTML lives here (e.g., public/apps/pongo.html)
  - assets/… – Built assets, e.g., /assets/pongo/dist/styles.css
- server/
  - server.js – Express + Socket.IO server
  - package.json – start/dev/test scripts

## How apps talk to the server

Two ready-to-use namespaces (pick one per app):

- /relay – Simple input/state relay between clients in a room (no server game logic)
- /game – Server-authoritative 2‑player Pong (physics + state)(existing)

Minimal client example using /relay (keyboard to server, server forwards to the room):

```html
<script>
const s = io('/relay');
s.emit('join', { roomId: 'arena-1', name: 'Alice' });
window.addEventListener('keydown', e => {
  const dir = e.key==='ArrowUp'?'up':e.key==='ArrowDown'?'down':null;
  if (dir) s.emit('input', { dir });
});
</script>
```

Pong app uses /game already. For new simple apps, /relay is the easiest.

## Deploy to DigitalOcean App Platform (1 service)

- Source: this repo
- Environment: Node.js (18+)
- HTTP Port: 3000 (default)
- Health check path: /health
- Optional env: CORS_ORIGIN (default is *)

Build Command (copy exactly):
- npm ci --prefix server
- npm ci --prefix Pongo || true
- npm run build:css:once --prefix Pongo || true

Run Command (copy exactly):
- npm start --prefix server

Notes:
- The Pongo CSS step is optional. If it fails (e.g., Tailwind CLI not present), the app still deploys; styles may be minimal.
- For local development, ./run dev already runs a CSS watcher if Pongo exists.

## Common URLs

- / → Landing (public/index.html)
- /apps/pongo.html → Pong demo (classic URL)
- /apps/neurobloom/index.html → NeuroBloom (classic URL)
- /pongo/room-1 → Clean URL that serves the Pongo app and sets ROOM_ID=room-1
- /neurobloom/session42 → Clean URL serving NeuroBloom with ROOM_ID=session42

## Troubleshooting

- Port already in use? You likely have a previous server running. Stop it or run ./run dev in a fresh shell.
- CORS issues on another domain? Set CORS_ORIGIN to your site origin in DO App settings.

## Developing new apps

- Add an HTML page under public/apps/<your-app>.html
- In the page, connect to `io('/relay')` and send inputs as needed
- If you add a build (e.g., Tailwind), output to public/assets/<app>/…
