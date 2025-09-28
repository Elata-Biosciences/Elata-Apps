# Pongo Multiplayer — Client-Side Prediction + Server Reconciliation

This document captures the intended networking model, what we’ve built, and what remains, so contributors can quickly understand, extend, and debug the system.

## Why this doc lives here
- The server exposes /docs as static content, so keeping this under docs/ makes it easy to view in-browser.
- Source of truth for the architecture and implementation status.

## High-level model
We use an authoritative server with client-side prediction and server reconciliation:
- Client emits input events with monotonically increasing sequence numbers.
- Server runs the simulation (paddles, ball, scoring) at a fixed tick rate.
- Server broadcasts snapshots that include `lastSeq` per side (last client input seq processed).
- Client keeps a queue of pending inputs; on each server snapshot it drops acked inputs and re-applies the remainder to its own paddle (prediction), while rendering opponent and ball via interpolation.

## Current implementation status

- Server (authoritative) [server/server.js]
  - [x] Fixed-timestep game loop (TICK_RATE)
  - [x] Round states: waiting → countdown → playing; countdown triggers serve
  - [x] Input queue per player with rate limiting and seq numbers
  - [x] Physics: paddle clamping, ball/paddle collisions, wall bounces, speed growth
  - [x] State broadcast: paddles, ball, scores, round state/timer, lastSeq
  - [x] Side assignment (left/right), spectators, max players
  - [x] Logging: console + file logs under /logs (auto-enabled in dev)

- Client (pongo.html)
  - [x] Socket connection to `/game`
  - [x] Input emission with seq; local prediction queue
  - [x] Server reconciliation (drop acked; reapply remaining)
  - [x] Snapshot buffering and 100ms render delay; interpolation of ball/opponent
  - [x] Correct mapping from normalized center coords to pixel top for paddles
  - [x] Correct ball center mapping to pixels
  - [x] Smooth local-paddle convergence to hide rare reconciliation snaps (easing)
  - [x] Single entry point with AI and Online modes; shared helpers in Pongo core
  - [x] UX: Copy room link; “your paddle” highlighting color

## Data exchanged
- Client → Server `input`
  - `{ action: 'move', direction: 'up'|'down', seq: number }`
- Server → Client `state`/`gameState`
  - `{ t, paddles: {left:number, right:number}, ball: {x,y,vx,vy}, scores, roundState, roundTimer, lastSeq: {left:number, right:number} }`

## Key mechanics

- Prediction & reconciliation
  - Client increments `seq` per input and pushes to `pending[]`.
  - On snapshot: `ackSeq = lastSeq[side]` → remove `pending[seq <= ackSeq]` → reapply remaining to the server-interpolated position to get the local target.
  - Render smoothing: tween the rendered paddle toward the local target (critically damped-ish exponential approach over ~80ms) to hide micro-corrections.

- Interpolation
  - Buffer recent snapshots with timestamps; render with a small delay (e.g., 100ms) by lerping between bracketing snapshots for opponent paddle and ball.

- Coordinate mapping
  - Server state is normalized (0..1) and centered for entities.
  - Paddles: convert centerY → top by `top = centerY*H - paddleH/2` and clamp to [0, H - paddleH].
  - Ball: map center directly to pixel coordinates.

## Logging & diagnostics
- Files: `/logs/server-YYYYMMDD-HHMMSS.log` (auto-created on start unless `NO_FILE_LOG=1`)
- Useful lines to watch:
  - `[game] join` with assigned sides and counts
  - `[game] startNewRound` → countdown seconds
  - `[game] start PLAYING` → serve direction
  - `[game] resetBall` → vx, vy at serve
  - `[game] tick` (1/sec) → roundState, roundTimer, ball {x,y,vx,vy}
- Enable verbosity: `DEBUG_GAME=1` (default in development)

## Testing
- Server unit tests (Jest): `cd server && npm test`
- Project harness: `./run test` (if available)
- Focused development loop: run the server in watch mode and reload clients

## Known risks and mitigations
- Divergence in client prediction: Mitigated by server reconciliation and smoothing.
- Visual snap on heavy correction: Mitigated by ease toward target; tune time constant as needed.
- Latency sensitivity: Tweak render delay window (`RENDER_BUFFER_MS`) and input repeat cadence.

## Open TODOs / next steps
- [ ] Tune smoothing time constant and render buffer under varied RTTs
- [ ] Spectator UX (explicit indicator, prevent input UI)
- [ ] Mobile controls (touch buttons / thumb slider in Online mode)
- [ ] Robust reconnect: restore side, clear stale buffers, resume round state cleanly
- [ ] Small HUD: “You are LEFT/RIGHT”, ping/packet loss indicator
- [ ] Optional: delta (correction-only) packets instead of full-state snapshots
- [ ] Optional: record/playback of rounds for debugging or demos

## Troubleshooting quick checks
- Ball doesn’t move after second player joins
  - Check logs for: `startNewRound` → `start PLAYING` → `resetBall` (vx ≠ 0)
  - If server shows PLAYING with vx ≠ 0, investigate client render mapping or snapshot buffer timing.
  - If server stays in `waiting`, ensure both players are counted (left/right assigned), and `maxPlayers` isn’t exceeded.

- Both players control same paddle
  - Verify side assignment in server logs (`[game] join`), and ensure client applies self vs opponent lanes correctly when writing to scene.

## Rollout notes
- Consolidated to a single app entry at `public/apps/pongo.html`.
- Shared helpers moved into Pongo core module under assets.
- Server serves `/docs`, `/apps`, and assets paths; no CDN requirement for dev.

