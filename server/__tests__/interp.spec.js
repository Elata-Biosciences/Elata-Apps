/* eslint-env jest */
const { lerp, clamp01, interpolateState } = require('../lib/interp');

describe('interpolation helpers', () => {
  test('lerp computes correct midpoints', () => {
    expect(lerp(0, 10, 0.5)).toBeCloseTo(5);
    expect(lerp(5, 15, 0.25)).toBeCloseTo(7.5);
  });

  test('clamp01 clamps properly', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
  });

  test('interpolateState blends paddles and ball between snapshots', () => {
    const s0 = { t: 1000, paddles: { left: 0.2, right: 0.8 }, ball: { x: 0.1, y: 0.4 }, scores: { left: 0, right: 0 } };
    const s1 = { t: 1100, paddles: { left: 0.4, right: 0.6 }, ball: { x: 0.3, y: 0.5 }, scores: { left: 0, right: 0 } };
    const sMid = interpolateState(s0, s1, s0.t, s1.t, 1050);
    expect(sMid.paddles.left).toBeCloseTo(0.3);
    expect(sMid.paddles.right).toBeCloseTo(0.7);
    expect(sMid.ball.x).toBeCloseTo(0.2);
    expect(sMid.ball.y).toBeCloseTo(0.45);
  });
});

