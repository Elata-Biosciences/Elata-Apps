// Pure interpolation helpers for client/server tests
// Times are in milliseconds (monotonic or Date.now-equivalent), positions in normalized [0..1]

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

// Interpolate between two snapshot states
// s0, s1: { t, paddles: {left:Number,right:Number}, ball: {x:Number,y:Number} }
// t0, t1: timestamps corresponding to s0 and s1 (ms)
// tRender: target render time (ms) where t0 <= tRender <= t1
function interpolateState(s0, s1, t0, t1, tRender) {
  if (!s0) return s1;
  if (!s1) return s0;
  const span = Math.max(1, t1 - t0);
  const a = clamp01((tRender - t0) / span);
  return {
    t: tRender,
    paddles: {
      left: lerp(s0.paddles.left, s1.paddles.left, a),
      right: lerp(s0.paddles.right, s1.paddles.right, a),
    },
    ball: {
      x: lerp(s0.ball.x, s1.ball.x, a),
      y: lerp(s0.ball.y, s1.ball.y, a),
    },
    scores: s1.scores,
  };
}

module.exports = { lerp, clamp01, interpolateState };

