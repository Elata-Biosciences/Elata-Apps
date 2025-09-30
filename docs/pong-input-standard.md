# Pong Input Protocol Standard (v1.1)

This document defines the input message format for the multiplayer Pong `/game` namespace. It supports both absolute paddle positioning and discrete directional inputs suitable for keyboards, controllers, and other devices.

Status: Stable
Audience: Client implementers (browser/Node/bridge)

---

## Transport
- Socket.IO namespace: `/game`
- Typical base URLs:
  - Local: `http://localhost:3000`
  - Render: `https://<your-service>.onrender.com`

Connect (browser):
```html
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<script>
  const BASE = 'http://localhost:3000';
  const game = io(BASE + '/game', { transports: ['websocket'] });
</script>
```

---

## Identity and Rooms
- Join a room immediately:
  - Client → Server: `join` `{ roomId: string, name?: string }`
  - Ack: `{ ok: boolean, playerId: string, side: 'left'|'right'|null, role: 'player'|'spectator' }`
- The first 2 joiners become players (left/right). Others are spectators.

---

## Input Messages

Two supported forms. Use whichever best matches your input device.

### 1) Absolute position (normalized)
- Client → Server: `input` `{ roomId: string, paddleY: number }`
  - `paddleY ∈ [0,1]` (0: top, 1: bottom)
- Server behavior:
  - Clamps to `[0,1]`
  - Updates the sending player’s paddle immediately
  - Relays to peers: `input` `{ side, paddleY }`

Example (mouse):
```js
window.addEventListener('mousemove', (e) => {
  const y = e.clientY / window.innerHeight;
  game.emit('input', { roomId: ROOM, paddleY: y });
});
```

### 2) Directional step (keyboard/controller-friendly)
- Client → Server: `input` `{ roomId: string, dir: 'up'|'down'|'left'|'right', step?: number }`
  - `step` optional; default `0.04` (normalized units per message)
- Server behavior:
  - Computes `yNew = clamp01(currentY + dy)` where `dy = ±step` for up/down
  - Left/right are reserved for future horizontal games and are currently ignored
  - Relays to peers: `input` `{ side, paddleY, dir }`

Example (keyboard):
```js
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'w') game.emit('input', { roomId: ROOM, dir: 'up' });
  if (e.key === 'ArrowDown' || e.key === 's') game.emit('input', { roomId: ROOM, dir: 'down' });
});
```

Example (gamepad polling loop):
```js
function pollGamepad(){
  const gp = navigator.getGamepads?.()[0];
  if (!gp) return;
  // Assume axis1 (vertical) and a threshold
  const yAxis = gp.axes[1] || 0;
  if (yAxis < -0.2) game.emit('input', { roomId: ROOM, dir: 'up', step: Math.min(0.08, 0.04 + (-yAxis)*0.06) });
  else if (yAxis > 0.2) game.emit('input', { roomId: ROOM, dir: 'down', step: Math.min(0.08, 0.04 + (yAxis)*0.06) });
}
```

---

## State Broadcasts (Server → Client)
- `state` `{ t, paddles: {left,right}, ball: {x,y,vx,vy}, scores: {left,right} }` @ ~30Hz
- `input` relay `{ side: 'left'|'right', paddleY: number, dir?: string }`
- `player:join`, `player:leave`

All positions are normalized `[0,1]` in both axes.

---

## Notes & Best Practices
- Clients may mix absolute and directional inputs; the server will apply them in the order received.
- For smoother keyboard control, emit `dir` on keydown then repeat at an interval while held; or move locally and rely on server `state` for correction.
- Use modest `step` values (`0.02–0.08`) to avoid jitter.
- Spectators must not send `input` messages; the server ignores them if not a player.

---

## Versioning
- v1.1: Adds directional `dir` inputs with optional `step`.
- v1.0: Absolute `paddleY` only.

