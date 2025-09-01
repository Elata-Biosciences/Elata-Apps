# Pongo

A minimalist retro Pong game for the web. Runs entirely client-side with Canvas rendering and optional chip-tune sound effects via Tone.js.

Live: https://doctorkhan.github.io/Pongo/

## Features
- Responsive canvas (16:9) with neon retro styling
- Simple computer AI and particle hit effects
- Scoreboard and win state with replay
- Sound effects (paddle, wall, scoring) using Tone.js
- Mute toggle and a Start overlay to comply with browser autoplay policies
- Production-safe CSS (no Tailwind CDN); local utilities in `dist/styles.css`

## Run locally
- Just open `index.html` in a browser, or serve the folder with any static server.

Optional local server:
```bash
# macOS/Linux
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Controls
- Mouse: move the paddle vertically by moving the cursor over the canvas
- Touch: drag on the canvas
- Click the 🔊 button to mute/unmute
- Click "Start" on load to enable audio

## Development notes
- CSS: The page uses a minimal set of utilities in `dist/styles.css` to avoid the Tailwind CDN production warning.
  - If you prefer generating CSS with Tailwind, use the CLI to compile `src/styles.css` to `dist/styles.css`:
  ```bash
  npx tailwindcss -i ./src/styles.css -o ./dist/styles.css --minify
  ```
  - The current repo includes `src/styles.css` as a starting point.
- Audio: Modern browsers require a user gesture to start audio. The Start overlay triggers `Tone.start()`; audio won’t play until you click Start.

## Deployment (GitHub Pages)
- Main branch contains `index.html` and assets; Pages can serve from `/ (root)`.
- `favicon.svg` is included to avoid 404s.

## Troubleshooting
- No sound: Ensure you clicked "Start" and your browser tab isn’t muted. Use the 🔊 toggle.
- CSS looks off: Make sure `dist/styles.css` is present and linked by `index.html`.

## License
ISC

## Credits
- [Tone.js](https://tonejs.github.io/) for audio
