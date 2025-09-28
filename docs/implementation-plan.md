# Implementation Plan: Multiplayer Pong (Client-Side Prediction & Server Reconciliation)

This document outlines the implementation plan to build the multiplayer Pong game using the **Client-Side Prediction and Server Reconciliation** model. This model provides a responsive user experience while maintaining the server as the authoritative source of truth, making the game fair and resilient to network latency.

---

### **Phase 1: Server-Side Foundation (Authoritative Server)**


## Model clarification: Deterministic simulation with server rectification → Hybrid CSP + Reconciliation

Your original idea maps to established real‑time networking like this:

- Deterministic simulation with server rectification (concept)
  1) Local physics simulation for instant feel
  2) Server as an occasional "nudge" to keep peers in sync
  3) Corrections must feel natural (no teleports)
  4) High lag tolerance

- Practical constraints in JS make full cross‑client determinism brittle:
  - Floating‑point differences and timer jitter cause drift
  - Divergence becomes chaos without an authority

- Adopted hybrid (this repo): Client‑Side Prediction + Server Reconciliation
  - Client predicts ONLY its own paddle immediately on input
  - Server remains authoritative for the full game (paddles, ball, scoring, round state)
  - Server broadcasts snapshots that act as corrections; the client reconciles by:
    - Dropping acked inputs (via `lastSeq[side]`)
    - Re‑applying unacked inputs on top of the server state for the local paddle
    - Tweening the rendered paddle toward the reconciled target to avoid pops
  - Opponent paddle and ball are rendered via interpolation between server snapshots

What runs where (authoritative vs predicted):
- Server authoritative
  - Ball physics, collisions, scoring, round state (waiting/countdown/playing)
  - Canonical paddle positions
- Client predicted (local only)
  - Own paddle movement between snapshots using input seqs
- Client interpolated (visual smoothing)
  - Opponent paddle and ball (and own paddle converges to reconciled target)

Correction cadence:
- Today: server sends full snapshots every tick (TICK_RATE). Clients treat these as corrections and interpolate for smoothness.
- Future optimization (optional): send rectification/delta packets less frequently; the client continues rendering locally between updates.

Design goals preserved:
- Instant local feel (zero‑lag self paddle) + fairness/anti‑cheat via server truth
- Natural‑seeming corrections by easing toward reconciled positions over ~50–100ms


Mapping to code (current repo):
- Server authority and snapshots: server/server.js (`tick()`, `resetBall()`, `startNewRound()`, `game.to(room.id).emit('state', ...)`).
- Input seq/ack: server/server.js (`player.inputs`, `lastProcessedSeq` → `lastSeq` in snapshots).
- Client prediction + reconciliation: public/apps/pongo/js/multiplayer.js (`pending[]`, `applyState()`, `applyPrediction()`).
- Client interpolation and rendering: public/apps/pongo/js/multiplayer.js (`STATE_BUFFER`, `stepMultiplayer()`), game rendering in public/apps/pongo/js/game.js.

Server tick and broadcast cadence:
- Simulation tick (authoritative): default 30 Hz. This keeps physics stable and CPU/network modest.
- Broadcast strategy:
  - Full snapshots: up to tick rate (30 Hz). Clients interpolate with ~100 ms buffer to hide jitter.
  - Per-client rectification: emitted each tick (or throttled to ~15–20 Hz) as a private `rectify` message with fields:
    - `side`, `ackSeq` (last input seq processed for that client)
    - `selfY` (canonical normalized center for that client’s paddle at server time `t`)
    - `oppY`, `roundState`, `roundTimer`, `scores` (context)
- Clients use `selfY`+`ackSeq` as the reconciliation baseline, reapply unacked inputs, and ease toward the new target. Opponent+ball remain interpolated from snapshots.
- Tuning knobs: lower snapshot frequency to reduce bandwidth; keep rectification regular to avoid long drift.


Wire details (current code):
- Server: in `tick()`, after broadcasting shared `state`, it now sends per-socket `rectify` with `{ t, side, ackSeq, selfY, oppY, roundState, roundTimer, scores }`.
- Client: listens for `rectify` and stores a recent baseline (normalized). During `stepMultiplayer()`, it uses that baseline (if fresh) to drive prediction + smoothing of the local paddle, logs jumps when corrections exceed thresholds, and continues to interpolate ball/opponent from snapshots.

Clock sync and time bases:
- Each client maintains an estimate of `SERVER_OFFSET_MS` using a lightweight ping (socket `time` RPC). `serverNow ≈ Date.now() + SERVER_OFFSET_MS`.
- Interpolation target is computed in server time: `targetT = (Date.now() + SERVER_OFFSET_MS) - RENDER_BUFFER_MS`.
- Snapshot buffer stores both receive time and `state.t` (server timestamp). Bracketing uses `state.t` to align all clients on the same time base.
- Rectification packets include `t` and `selfY`; client prefers a fresh baseline when `(serverNowEst - t) < 250ms`.



The goal of this phase is to create a server that can run a complete, deterministic game on its own, without any clients connected.

1.  **Game State Management (`server.js`)**
    *   Create a comprehensive `gameState` object to hold the position of the ball, both paddles, scores, and any other relevant state.
    *   Define game constants (e.g., `CANVAS_WIDTH`, `PADDLE_SPEED`) in a single, accessible location.

2.  **Room and Player Management (`server.js`)**
    *   Implement a `rooms` map to manage multiple game instances.
    *   When a new client connects (`io.on('connection')`), allow them to `join` a room.
    *   Assign players to a `side` (`left` or `right`) or as a `spectator`.
    *   Handle disconnects (`socket.on('disconnect')`) by removing the player from the room and cleaning up if the room becomes empty.

3.  **Deterministic Game Loop (`server.js`)**
    *   Implement a `setInterval` loop that runs at a fixed `TICK_RATE` (e.g., 30 times per second). This will be the heartbeat of the game.
    *   The loop must use a fixed `dt` (delta time) to ensure the simulation is deterministic.

4.  **Input Handling (`server.js`)**
    *   Create a queue within each player's state to hold incoming inputs (e.g., `{ action: 'move', direction: 'up', seq: 1 }`).
    *   Listen for `input` events from clients and add valid inputs to the queue, checking for sequence numbers to discard old or out-of-order inputs.

5.  **Physics Engine (`server.js`)**
    *   Inside the game loop (`tick` function):
        *   Process all inputs in each player's queue to update their paddle positions.
        *   Implement the ball's movement logic using the fixed `dt`.
        *   Add robust collision detection for the ball against walls and paddles.
        *   Implement scoring logic and reset the ball's position after a point is scored.

6.  **State Broadcasting (`server.js`)**
    *   At the end of each game loop tick, broadcast the authoritative `gameState` to all clients in the room.
    *   Crucially, this state must include the **sequence number of the last input processed** for each player. This is vital for client-side reconciliation.

---

### **Phase 2: Client-Side Implementation (Prediction & Reconciliation)**

This phase focuses on building a client that feels responsive, intelligently predicts player movement, and smoothly handles corrections from the server.

7.  **Basic Setup (`pongo/js/main.js`, `pongo/js/multiplayer.js`)**
    *   Establish a connection to the `/game` namespace on the server.
    *   Create a `requestAnimationFrame` loop for rendering, which is independent of the server's tick rate.
    *   Listen for the `state` event from the server. Initially, render the received state directly to the canvas to confirm the connection.

8.  **Input Sending (`pongo/js/multiplayer.js`)**
    *   Capture keyboard events for paddle movement.
    *   When a key is pressed, send the input to the server immediately via a `socket.emit('input', ...)`.
    *   Each input event **must** include a client-side incrementing sequence number.

9.  **Client-Side Prediction (`pongo/js/multiplayer.js`)**
    *   When the local player presses a key, move their paddle on the screen **instantly**. Do not wait for the server's response.
    *   Store these "pending" inputs (inputs sent to the server but not yet acknowledged) in a local queue.

10. **Server Reconciliation (`pongo/js/multiplayer.js`)**
    *   When a `state` update is received from the server:
        a. Get the authoritative state of your paddle from the server's payload.
        b. The payload includes the sequence number of the last input the server processed for you.
        c. Discard all inputs in your local `pending_inputs` queue that are older than or equal to this acknowledged sequence number.
        d. **Re-apply** the remaining `pending_inputs` to the authoritative paddle state. This re-simulates your movement from the last known correct position.
        e. The result is the "corrected" position. In most cases, it will match the predicted position. If not, smoothly animate (interpolate) the paddle to the corrected position over a few frames to avoid a jarring jump.

11. **Entity Interpolation (`pongo/js/multiplayer.js`)**
    *   The ball and the opponent's paddle will appear to stutter if rendered directly from the server's tick rate.
    *   To smooth this out, maintain a small buffer of the last two `gameState` updates.
    *   In the rendering loop, calculate the ideal position of the ball and the opponent's paddle by interpolating between these two states based on the current time. This ensures their movement appears fluid.

