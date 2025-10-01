/* eslint-env jest */
const { start, stop } = require('../server');
const { io } = require('socket.io-client');

jest.setTimeout(20000);

function connectNS(url) {
  return new Promise((resolve, reject) => {
    const s = io(url, { transports: ['websocket'], forceNew: true });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

function waitNextState(socket, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no state received in time')), timeoutMs);
    socket.once('state', (s) => { clearTimeout(timer); resolve(s); });
  });
}

describe('server input controls paddle movement', () => {
  let port; let base;

  beforeAll(async () => {
    port = await start(0);
    base = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await stop();
  });

  test('absolute input sets paddle position reflected in state', async () => {
    const a = await connectNS(base + '/game');
    const b = await connectNS(base + '/game');
    const roomId = 'ctrl-abs-1';

    const ackA = await new Promise((resolve) => a.emit('join', { roomId, name: 'A' }, resolve));
    await new Promise((resolve) => b.emit('join', { roomId, name: 'B' }, resolve));

    // Get initial state to ensure broadcasts are flowing
    await waitNextState(a);

    // Send absolute paddle position (horizontal)
    const target = 0.9;
    a.emit('input', { roomId, paddleX: target });

    // Wait for next state and assert our side moved
    const s = await waitNextState(a);
    expect(s.paddles).toBeDefined();
    const side = ackA.side; // 'left' (top) or 'right' (bottom)
    expect(typeof s.paddles[side]).toBe('number');
    // Allow tiny float differences
    expect(Math.abs(s.paddles[side] - target)).toBeLessThanOrEqual(1e-6);

    a.disconnect();
    b.disconnect();
  });

  test('directional inputs move paddle by step increments', async () => {
    const a = await connectNS(base + '/game');
    const b = await connectNS(base + '/game');
    const roomId = 'ctrl-dir-1';

    const ackA = await new Promise((resolve) => a.emit('join', { roomId, name: 'A' }, resolve));
    await new Promise((resolve) => b.emit('join', { roomId, name: 'B' }, resolve));

    // Grab a baseline state
    let s0 = await waitNextState(a);
    const side = ackA.side;
    const startX = s0.paddles[side];

    // Send three right steps of 0.05 each (total 0.15)
    const step = 0.05;
    a.emit('input', { roomId, dir: 'right', step });
    a.emit('input', { roomId, dir: 'right', step });
    a.emit('input', { roomId, dir: 'right', step });

    // Wait for next state
    const s1 = await waitNextState(a);
    const newX = s1.paddles[side];

    // Expect movement in the positive direction (bounded in [0,1])
    const expected = Math.max(0, Math.min(1, startX + 3 * step));
    expect(newX).toBeGreaterThanOrEqual(expected - 1e-6);

    // Now send two left steps of same size and verify it decreases
    a.emit('input', { roomId, dir: 'left', step });
    a.emit('input', { roomId, dir: 'left', step });

    const s2 = await waitNextState(a);
    const newX2 = s2.paddles[side];
    const expected2 = Math.max(0, Math.min(1, expected - 2 * step));
    expect(newX2).toBeLessThanOrEqual(expected + 1e-6);
    expect(newX2).toBeGreaterThanOrEqual(expected2 - 1e-6);

    a.disconnect();
    b.disconnect();
  });
});

