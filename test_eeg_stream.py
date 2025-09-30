#!/usr/bin/env python3
"""
Test EEG stream simulator
Generates fake EEG predictions for testing the Pongo controller.
"""

import time
import random
import sys

def generate_prediction_line(pred_class):
    """Generate a fake prediction line"""
    # Generate random probabilities that favor the predicted class
    probs = [0.1, 0.1, 0.1]
    probs[pred_class] = 0.8
    
    # Add some noise
    for i in range(3):
        probs[i] += random.uniform(-0.05, 0.05)
    
    # Normalize
    total = sum(probs)
    probs = [p/total for p in probs]
    
    line = f"[pred] raw={pred_class} smoothed={pred_class} probs=[{probs[0]:.3f}, {probs[1]:.3f}, {probs[2]:.3f}] | fs=250.0Hz win=250 hop=62 | Fp1=ch3 Fp2=ch6"
    return line

def main():
    print("[TEST] Starting EEG stream simulator", file=sys.stderr)
    print("[TEST] Generating: 0=left, 1=right, 2=neutral", file=sys.stderr)
    print("[TEST] Press Ctrl+C to stop", file=sys.stderr)
    
    try:
        while True:
            # Generate a random prediction (favor rest)
            pred = random.choices([0, 1, 2], weights=[0.5, 0.25, 0.25])[0]
            
            line = generate_prediction_line(pred)
            print(line)
            sys.stdout.flush()
            
            # Wait ~500ms (2 Hz)
            time.sleep(0.5)
            
    except KeyboardInterrupt:
        print("\n[TEST] Stopped", file=sys.stderr)

if __name__ == '__main__':
    main()

