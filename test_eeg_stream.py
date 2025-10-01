#!/usr/bin/env python3
"""
Test EEG stream simulator
Generates fake EEG predictions for testing the Pongo controller.
This version simulates smooth, realistic movement patterns.
"""

import time
import random
import sys
import json
import math

def generate_smooth_probabilities(t, pattern='sine'):
    """
    Generate smooth probability vectors that create realistic paddle movement.
    
    Args:
        t: Time in seconds (float)
        pattern: Type of movement pattern ('sine', 'sweep', 'hold')
    """
    if pattern == 'sine':
        # Smooth sinusoidal movement from left to right
        # Map sine wave (-1 to 1) to position (0 to 1)
        position = (math.sin(t * 0.5) + 1) / 2  # Slow oscillation
        
    elif pattern == 'sweep':
        # Smooth sweep from left to right and back
        position = (t % 4.0) / 4.0  # 4-second cycle
        if position > 0.5:
            position = 1.0 - position  # Reverse direction
            
    elif pattern == 'hold':
        # Hold positions for a few seconds, then smoothly transition
        cycle = t % 6.0
        if cycle < 2.0:
            position = 0.2  # Hold left
        elif cycle < 3.0:
            # Smooth transition to center
            position = 0.2 + (cycle - 2.0) * 0.3
        elif cycle < 5.0:
            position = 0.5  # Hold center
        else:
            # Smooth transition to right
            position = 0.5 + (cycle - 5.0) * 0.3
    else:
        position = 0.5
    
    # Convert position to probabilities
    # Position close to 0 = left, 0.5 = center, 1.0 = right
    if position < 0.33:
        # Favor left
        left_prob = 0.6 + (0.33 - position) * 0.8
        center_prob = 0.3
        right_prob = 0.1
    elif position > 0.67:
        # Favor right
        left_prob = 0.1
        center_prob = 0.3
        right_prob = 0.6 + (position - 0.67) * 0.8
    else:
        # Favor center
        left_prob = 0.2
        center_prob = 0.6
        right_prob = 0.2
    
    # Add tiny bit of noise for realism (much less than before)
    noise = [random.uniform(-0.02, 0.02) for _ in range(3)]
    probs = [left_prob + noise[0], center_prob + noise[1], right_prob + noise[2]]
    
    # Normalize
    total = sum(probs)
    probs = [max(0, p/total) for p in probs]
    
    return probs

def main():
    print("[TEST] Starting EEG stream simulator", file=sys.stderr)
    print("[TEST] Generating smooth movement patterns", file=sys.stderr)
    print("[TEST] 0=left, 1=center, 2=right", file=sys.stderr)
    print("[TEST] Press Ctrl+C to stop", file=sys.stderr)
    
    start_time = time.time()
    pattern = 'sine'  # Change to 'sweep' or 'hold' for different patterns
    
    try:
        while True:
            elapsed = time.time() - start_time
            probs = generate_smooth_probabilities(elapsed, pattern)
            
            line = json.dumps({'probs': probs})
            print(line)
            sys.stdout.flush()
            
            # 20 Hz update rate (50ms) - faster for smoother data
            time.sleep(0.05)
            
    except KeyboardInterrupt:
        print("\n[TEST] Stopped", file=sys.stderr)

if __name__ == '__main__':
    main()

