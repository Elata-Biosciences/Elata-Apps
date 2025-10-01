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

function waitForEvent(sock, event, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    sock.once(event, (msg) => { clearTimeout(timer); resolve(msg); });
  });
}

describe('relay namespace forwards input between EEG and browser clients in same room', () => {
  let port; let base;

  beforeAll(async () => {
    port = await start(0);
    base = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await stop();
  });

  test('EEG (/relay) input is received by /relay listener in same room', async () => {
    const roomId = 'relay-room-1';

    // Listener: connect to relay namespace and join room (simulates browser)
    const listener = await connectNS(base + '/relay');
    const ackRelay = await new Promise((resolve) => listener.emit('join', { roomId, name: 'browser-relay' }, resolve));
    expect(ackRelay && ackRelay.ok).toBe(true);

    // Emitter: connect to relay namespace and join same room (simulates EEG client)
    const emitter = await connectNS(base + '/relay');
    const ackEEG = await new Promise((resolve) => emitter.emit('join', { roomId, name: 'eeg' }, resolve));
    expect(ackEEG && ackEEG.ok).toBe(true);

    // Send an input payload (as eeg_to_pongo.py would)
    const payload = { paddleX: 0.2, command: 'left' };
    emitter.emit('input', payload);

    // Assert relay listener receives same payload (plus from/socket id)
    const msg = await waitForEvent(listener, 'input');
    expect(typeof msg).toBe('object');
    expect(msg).toHaveProperty('paddleX', payload.paddleX);
    expect(msg).toHaveProperty('command', payload.command);
    expect(typeof msg.from).toBe('string');

    listener.disconnect();
    emitter.disconnect();
  });
});

