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

describe('max players per room (default=2)', () => {
  let port; let base;
  beforeAll(async () => { port = await start(0); base = `http://localhost:${port}`; });
  afterAll(async () => { await stop(); });

  test('third joiner becomes spectator when two players already seated', async () => {
    const a = await connectNS(base + '/game');
    const b = await connectNS(base + '/game');
    const c = await connectNS(base + '/game');

    const roomId = 'mp1';
    const ackA = await new Promise((resolve) => a.emit('join', { roomId, name: 'A' }, resolve));
    const ackB = await new Promise((resolve) => b.emit('join', { roomId, name: 'B' }, resolve));
    const ackC = await new Promise((resolve) => c.emit('join', { roomId, name: 'C' }, resolve));

    expect(ackA.role).toBe('player');
    expect(ackB.role).toBe('player');
    expect(ackC.role).toBe('spectator');
    expect(ackC.side).toBeFalsy();

    a.disconnect();
    b.disconnect();
    c.disconnect();
  });
});

