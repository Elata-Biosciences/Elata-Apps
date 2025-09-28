// Pongo/js/main.js

import { initGame, updateGame, draw, player, computer, resetBall, ball } from './game.js';
import { initUI, updateScores, showMessage, hideMessage, hideStartOverlay, updateMuteButton, showToast } from './ui.js';
import { initAudio, playSound, toggleMute } from './audio.js';
import { initMultiplayer, setupSocket, stepMultiplayer, requestRestart } from './multiplayer.js';

const canvas = document.getElementById('pongCanvas');
const ctx = canvas.getContext('2d');

let useMultiplayer = false;
let gameRunning = false;
let animationFrameId;

function getRoomId() {
    try {
        const parts = (location.pathname || '/').split('/').filter(Boolean);
        return parts[1] || 'default';
    } catch {
        return 'default';
    }
}

function init() {
    canvas.width = 800;
    canvas.height = 600;

    const q = new URLSearchParams(location.search);
    const mode = (q.get('mode') || '').toLowerCase();
    const ai = q.get('ai');
    const aiRequested = (mode === 'ai') || (ai === '1') || (ai === 'true');
    useMultiplayer = !aiRequested;

    const urlDebug = /[?&]debug=1/.test(location.search);
    const isLocalDev = ['localhost', '127.0.0.1'].includes(location.hostname);
    const DEBUG_MP = urlDebug || (localStorage.getItem('DEBUG_MP') === '1') || isLocalDev;

    initGame(canvas, ctx);
    initUI(restartGame, startMultiplayer, startSinglePlayer);
    initAudio();
    initMultiplayer(DEBUG_MP);

    if (useMultiplayer) {
        setupSocket(getRoomId());
        // Auto-start render loop for multiplayer so paddles/ball draw without a click
        try { hideStartOverlay(); } catch {}
        gameRunning = true;
    }

    // Mouse movement for player paddle
    canvas.addEventListener('mousemove', (evt) => {
        if (!useMultiplayer) {
            let rect = canvas.getBoundingClientRect();
            player.y = evt.clientY - rect.top - player.height / 2;
        }
    });

    gameLoop();
}

function gameLoop(now) {
    if (gameRunning) {
        if (useMultiplayer) {
            stepMultiplayer(now, player, computer, ball, canvas);
        } else {
            updateGame(!useMultiplayer);
        }
        draw();
        updateScores(player.score, computer.score);

        if (player.score >= 5 || computer.score >= 5) {
            const message = player.score >= 5 ? "You Win!" : "Computer Wins!";
            showMessage(message);
            gameRunning = false;
        }
    }
    animationFrameId = requestAnimationFrame(gameLoop);
}

function restartGame() {
    player.score = 0;
    computer.score = 0;
    resetBall();
    hideMessage();
    gameRunning = true;
}

function startSinglePlayer() {
    useMultiplayer = false;
    hideStartOverlay();
    gameRunning = true;
    showToast("Single player mode started");
}

function startMultiplayer() {
    useMultiplayer = true;
    setupSocket(getRoomId());
    hideStartOverlay();
    gameRunning = true;
    showToast("Multiplayer mode started");
}

// Initialize the game when the script is loaded

// Toolbar restart button handler
const restartGameButton = document.getElementById('restartGameButton');
if (restartGameButton) restartGameButton.addEventListener('click', () => {
    if (useMultiplayer) {
        try { requestRestart(); } catch {}
        showToast('Restart requested…');
    } else {
        restartGame();
        showToast('Restarted');
    }
});

init();
