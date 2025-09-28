// Pongo/js/ui.js

import { setSpeedMultiplier } from './game.js';

let playerScoreElem, computerScoreElem, messageBox, messageText, restartButton, muteButton, speedButton, speedModal, closeSpeedModal, countdownElem, startOverlay, startButton, startAIButton, toast;

export function initUI(onRestart, onStart, onStartAI) {
    playerScoreElem = document.getElementById('player-score');
    computerScoreElem = document.getElementById('computer-score');
    messageBox = document.getElementById('messageBox');
    messageText = document.getElementById('messageText');
    restartButton = document.getElementById('restartButton');
    muteButton = document.getElementById('muteButton');
    speedButton = document.getElementById('speedButton');
    speedModal = document.getElementById('speedModal');
    closeSpeedModal = document.getElementById('closeSpeedModal');
    countdownElem = document.getElementById('countdown');
    startOverlay = document.getElementById('startOverlay');
    startButton = document.getElementById('startButton');
    startAIButton = document.getElementById('startAIButton');
    toast = document.getElementById('toast');

    restartButton.addEventListener('click', onRestart);
    startButton.addEventListener('click', onStart);
    startAIButton.addEventListener('click', onStartAI);

    speedButton.addEventListener('click', () => speedModal.classList.remove('hidden'));
    closeSpeedModal.addEventListener('click', () => speedModal.classList.add('hidden'));

    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');
    speedSlider.addEventListener('input', (e) => {
        const multiplier = parseFloat(e.target.value);
        setSpeedMultiplier(multiplier);
        speedValue.textContent = multiplier.toFixed(2) + 'x';
    });
}

export function updateScores(playerScore, computerScore) {
    playerScoreElem.textContent = playerScore;
    computerScoreElem.textContent = computerScore;
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
