// Pongo/js/ui.js

import { setSpeedMultiplier } from './game.js';

let playerScoreElem, computerScoreElem, messageBox, messageText, restartButton, muteButton, speedButton, speedModal, closeSpeedModal, countdownElem, startOverlay, toast, gameTimerElem;

export function initUI(onRestart, onStart) {
    playerScoreElem = document.getElementById('player-score');
    computerScoreElem = document.getElementById('computer-score');
    gameTimerElem = document.getElementById('game-timer');
    messageBox = document.getElementById('messageBox');
    messageText = document.getElementById('messageText');
    restartButton = document.getElementById('restartButton');
    muteButton = document.getElementById('muteButton');
    speedButton = document.getElementById('speedButton');
    speedModal = document.getElementById('speedModal');
    closeSpeedModal = document.getElementById('closeSpeedModal');
    countdownElem = document.getElementById('countdown');
    startOverlay = document.getElementById('startOverlay');
    toast = document.getElementById('toast');

    restartButton.addEventListener('click', onRestart);

    const startButton = document.getElementById('startButton');
    if (startButton && typeof onStart === 'function') {
        startButton.addEventListener('click', onStart);
    }
}

export function updateScores(playerScore, computerScore) {
    playerScoreElem.textContent = playerScore;
    computerScoreElem.textContent = computerScore;
}

export function updateGameTimer(minutes, seconds) {
    if (gameTimerElem) {
        gameTimerElem.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

export function showMessage(message, showButton = true) {
    messageText.textContent = message;
    messageBox.classList.remove('hidden');
    if (showButton) {
        restartButton.classList.remove('hidden');
    } else {
        restartButton.classList.add('hidden');
    }
}

export function hideMessage() {
    messageBox.classList.add('hidden');
}

export function hideStartOverlay() {
    startOverlay.classList.add('hidden');
}

export function updateMuteButton(isMuted) {
    muteButton.textContent = isMuted ? '🔇' : '🔊';
}

export function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

export function updateCountdown(t) {
    const n = Math.max(1, Math.ceil(t));
    countdownElem.textContent = String(n);
    countdownElem.style.display = 'flex';
}

export function hideCountdown() {
    countdownElem.style.display = 'none';
}
