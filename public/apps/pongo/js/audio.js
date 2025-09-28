// Pongo/js/audio.js

let toneLoadPromise = null;
let isMuted = false;
let synth, ping, pong;

function loadTone() {
    if (window.Tone) return Promise.resolve();
    if (toneLoadPromise) return toneLoadPromise;
    toneLoadPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/assets/pongo/vendor/tone/Tone.min.js';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = (e) => reject(new Error('Failed to load Tone.js'));
        document.head.appendChild(s);
    });
    return toneLoadPromise;
}

export async function initAudio() {
    await loadTone();
    if (window.Tone) {
        synth = new Tone.Synth().toDestination();
        ping = new Tone.MembraneSynth({
            pitchDecay: 0.05,
            octaves: 10,
            oscillator: { type: "sine" },
            envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: "exponential" }
        }).toDestination();
        pong = new Tone.MembraneSynth({
            pitchDecay: 0.01,
            octaves: 5,
            oscillator: { type: "triangle" },
            envelope: { attack: 0.001, decay: 0.2, sustain: 0.01, release: 0.8, attackCurve: "exponential" }
        }).toDestination();
    }
    document.getElementById('muteButton').addEventListener('click', toggleMute);
}

export function playSound(sound) {
    if (isMuted || !window.Tone) return;
    try {
        switch (sound) {
            case 'paddle':
                ping.triggerAttackRelease("C2", "8n");
                break;
            case 'wall':
                pong.triggerAttackRelease("G1", "8n");
                break;

            case 'score':
                synth.triggerAttackRelease("C4", "8n");
                break;
        }
    } catch (error) {
        console.error("Error playing sound:", error);
    }
}

export function toggleMute() {
    isMuted = !isMuted;
    if (window.Tone) {
        Tone.Destination.mute = isMuted;
    }
    return isMuted;
}
