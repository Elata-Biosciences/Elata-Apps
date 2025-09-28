/* eslint-env jest */
const { io } = require('socket.io-client');

jest.setTimeout(20000);

function connectNS(url) {
  return new Promise((resolve, reject) => {
    const s = io(url, { transports: ['websocket'], forceNew: true });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

describe('per-client rectification and time sync', () => {
  let start, stop; let port; let base;

  beforeAll(async () => {
    ({ start, stop } = require('../server'));
    port = await start(0);
    base = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await stop();
  });

  test('server emits rectify with self baseline per client', async () => {
    const a = await connectNS(base + '/game');
    const b = await connectNS(base + '/game');
    const roomId = 'rectify-room-1';

    const ackA = await new Promise((resolve) => a.emit('join', { roomId, name: 'A' }, resolve));
    await new Promise((resolve) => b.emit('join', { roomId, name: 'B' }, resolve));

    const rect = await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('no rectify received')), 2000);
      a.once('rectify', (msg) => { clearTimeout(to); resolve(msg); });
    });

    expect(rect).toEqual(expect.objectContaining({
      t: expect.any(Number),
      side: ackA.side,
      ackSeq: expect.any(Number),
      selfY: expect.any(Number),
      oppY: expect.any(Number),
    }));
    expect(rect.selfY).toBeGreaterThanOrEqual(0);
    expect(rect.selfY).toBeLessThanOrEqual(1);

    a.disconnect();
    b.disconnect();
  });

  test('time RPC returns server time', async () => {
    const a = await connectNS(base + '/game');
    const got = await new Promise((resolve) => {
      const c0 = Date.now();
      a.emit('time', { c0 }, (res) => resolve({ res, c0 }));
    });
    expect(typeof got.res.serverNow).toBe('number');
    // Allow any value, but it should be within +/- 10s of local clock typically
    expect(Math.abs(got.res.serverNow - Date.now())).toBeLessThan(10 * 1000);
    a.disconnect();
  });
});

