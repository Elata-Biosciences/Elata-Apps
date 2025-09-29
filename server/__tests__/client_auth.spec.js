/* eslint-env jest */

// Enable feature-flag before server starts
process.env.CLIENT_AUTH_BALL = '1';

const { io } = require('socket.io-client');

jest.setTimeout(20000);

function connectNS(url) {
  return new Promise((resolve, reject) => {
    const s = io(url, { transports: ['websocket'], forceNew: true });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

describe('Client-authoritative events (feature-flagged)', () => {
  let start, stop; let port; let base;

  beforeAll(async () => {
    ({ start, stop } = require('../server'));
    port = await start(0);
    base = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await stop();
  });

  test('hit vs score near-simultaneous prefers hit and emits rectify', async () => {
    const a = await connectNS(base + '/game');
    const b = await connectNS(base + '/game');

    let roomId = 't_room_hit_score_' + Math.random().toString(36).slice(2);

    const ackA = await new Promise((resolve) => a.emit('join', { roomId, name: 'A' }, resolve));
    await new Promise((resolve) => b.emit('join', { roomId, name: 'B' }, resolve));

    const gotRectify = new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('no rectifyDecision received')), 2000);
      a.once('rectifyDecision', (msg) => { clearTimeout(to); resolve(msg); });
    });

    const t = Date.now();
    a.emit('score', { t, for: 'right', ball: { x: 1.05, y: 0.5, vx: 0.4, vy: 0 } });
    await new Promise(r => setTimeout(r, 10));
    b.emit('hit', { t: t + 20, sideHit: 'left', ball: { x: 0.1, y: 0.5, vx: 0.3, vy: 0 } });

    const msg = await gotRectify;
    expect(msg && msg.reason).toBe('prefer_hit_over_score');
    expect(typeof msg.ball.vx).toBe('number');

    a.disconnect();
    b.disconnect();
  });

  test('agreeing score emits single scoreUpdate', async () => {
    const a = await connectNS(base + '/game');
    const b = await connectNS(base + '/game');
    const roomId = 't_room_score_once_' + Math.random().toString(36).slice(2);

    await new Promise((resolve) => a.emit('join', { roomId, name: 'A' }, resolve));
    await new Promise((resolve) => b.emit('join', { roomId, name: 'B' }, resolve));

    let updates = 0;
    function onUpdate() { updates += 1; }
    a.on('scoreUpdate', onUpdate);
    b.on('scoreUpdate', onUpdate);

    const t = Date.now();
    a.emit('score', { t, for: 'right', ball: { x: 1.05, y: 0.5, vx: 0.6, vy: 0 } });
    b.emit('score', { t: t + 5, for: 'right', ball: { x: 1.01, y: 0.5, vx: 0.5, vy: 0 } });

    await new Promise(r => setTimeout(r, 400));
    expect(updates).toBeGreaterThanOrEqual(1);
    expect(updates).toBeLessThanOrEqual(2);

    a.disconnect();
    b.disconnect();
  });
});

