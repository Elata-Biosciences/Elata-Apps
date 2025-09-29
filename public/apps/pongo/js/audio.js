// Pongo/js/audio.js

let audioSystem = null;
let audioReady = false;
let isMuted = false;

// Lazy-load Tone.js only after a user gesture to avoid autoplay warnings
let toneLoadPromise = null;
function loadTone() {
    if (window.Tone) return Promise.resolve();
    if (toneLoadPromise) return toneLoadPromise;
    toneLoadPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/vendor/tone/Tone.min.js';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = (e) => reject(new Error('Failed to load Tone.js'));
        document.head.appendChild(s);
    });
    return toneLoadPromise;
}

class AudioSystem {
    constructor() {
        this.sounds = {};
        this.effects = {};
        this.masterVolume = new Tone.Volume(-6).toDestination();
        this.setupEffects();
        this.setupSounds();
    }

    setupEffects() {
        this.effects.reverb = new Tone.Reverb({
            decay: 1.5,
            wet: 0.2
        }).connect(this.masterVolume);

        this.effects.delay = new Tone.FeedbackDelay("8n", 0.25).connect(this.effects.reverb);
        
        this.effects.compressor = new Tone.Compressor({
            threshold: -24,
            ratio: 12,
            attack: 0.003,
            release: 0.25
        }).connect(this.effects.delay);
    }

    setupSounds() {
        this.sounds.paddleHit = new Tone.MembraneSynth({
            pitchDecay: 0.05,
            octaves: 10,
            oscillator: { type: "sine" },
            envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: "exponential" }
        }).connect(this.effects.compressor);

        this.sounds.wallBounce = new Tone.MembraneSynth({
            pitchDecay: 0.01,
            octaves: 4,
            oscillator: { type: "sine" },
            envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.5 }
        }).connect(this.effects.compressor);

        this.sounds.playerScore = new Tone.Synth({
            oscillator: { type: "sawtooth" },
            envelope: { attack: 0.01, decay: 0.4, sustain: 0.2, release: 0.8 }
        }).connect(this.effects.reverb);

        this.sounds.computerScore = new Tone.Synth({
            oscillator: { type: "square" },
            envelope: { attack: 0.02, decay: 0.5, sustain: 0.1, release: 1 }
        }).connect(this.effects.reverb);
    }

    play(sound, ...args) {
        if (!audioReady || isMuted || !this.sounds[sound]) return;
        
        try {
            switch(sound) {
                case 'paddleHit':
                    this.sounds.paddleHit.triggerAttackRelease("C2", "8n");
                    break;
                case 'wallBounce':
                    this.sounds.wallBounce.triggerAttackRelease("G1", "8n");
                    break;
                case 'playerScore':
                    this.sounds.playerScore.triggerAttackRelease("C5", "4n");
                    break;
                case 'computerScore':
                    this.sounds.computerScore.triggerAttackRelease("G2", "2n");
                    break;
            }
        } catch (e) {
            console.warn(`Audio error playing ${sound}:`, e);
        }
    }
}

export async function initAudio() {
    try {
        await loadTone();
        if (Tone.context.state !== 'running') {
            await Tone.start();
        }
        audioSystem = new AudioSystem();
        audioReady = true;
        console.log("Audio system initialized.");
    } catch (e) {
        console.warn("Could not initialize audio:", e);
        audioReady = false;
    }
    return audioReady;
}

export function playSound(sound, ...args) {
    if (audioSystem) {
        audioSystem.play(sound, ...args);
    }
}

export function toggleMute() {
    if (!audioReady) return;
    isMuted = !isMuted;
    Tone.Destination.mute = isMuted;
    return isMuted;
}
