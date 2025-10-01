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

        this.sounds.countdown = new Tone.Synth({
            oscillator: { type: "triangle" },
            envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 }
        }).connect(this.masterVolume);
    }

    play(sound, ...args) {
        if (!this.sounds[sound] || isMuted) return;
        
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
                case 'countdown':
                    this.sounds.countdown.triggerAttackRelease("A4", "16n");
                    break;
            }
        } catch (e) {
            console.warn(`Audio error playing ${sound}:`, e);
        }
    }
}

export async function initAudio() {
    try {
        console.log('[audio] Starting audio initialization...');
        await loadTone();
        console.log('[audio] Tone.js loaded, context state:', Tone.context.state);

        if (Tone.context.state !== 'running') {
            console.log('[audio] Starting Tone context...');
            await Tone.start();
            console.log('[audio] Tone context started, state:', Tone.context.state);
        }

        if (!audioSystem) {
            console.log('[audio] Creating AudioSystem...');
            audioSystem = new AudioSystem();
            console.log('[audio] AudioSystem created');
        }

        audioReady = true;
        console.log("[audio] ✓ Audio system fully initialized and ready");
        return true;
    } catch (e) {
        console.error("[audio] ✗ Could not initialize audio:", e);
        audioReady = false;
        return false;
    }
}

export function playSound(sound, ...args) {
    if (!audioReady) {
        console.warn(`[audio] Cannot play '${sound}' - audio not ready`);
        return;
    }
    if (!audioSystem) {
        console.warn(`[audio] Cannot play '${sound}' - audioSystem not initialized`);
        return;
    }
    console.log(`[audio] Playing sound: ${sound}`);
    audioSystem.play(sound, ...args);
}

export function toggleMute() {
    isMuted = !isMuted;
    if (audioReady && window.Tone) {
        Tone.Destination.mute = isMuted;
    }
    console.log(`[audio] Mute toggled: ${isMuted}`);
    return isMuted;
}
