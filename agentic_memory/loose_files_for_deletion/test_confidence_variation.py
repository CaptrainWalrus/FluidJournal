#!/usr/bin/env python3
"""Test confidence calculation variation"""

import numpy as np

def calculate_confidence_old(pnl_std, trajectory_std=None, pnl_mean=0):
    """Old confidence calculation"""
    uncertainty_ratio = pnl_std / 100.0
    uncertainty_confidence = 1.0 / (1.0 + uncertainty_ratio)
    
    if pnl_std > 0:
        sharpe_like = pnl_mean / pnl_std
        return_confidence = 0.5 + 0.4 * np.tanh(sharpe_like)
    else:
        return_confidence = 0.5
    
    trajectory_confidence = 0.5
    
    confidence = (0.4 * uncertainty_confidence + 
                 0.4 * return_confidence + 
                 0.2 * trajectory_confidence)
    
    return max(0.1, min(0.95, confidence))

def calculate_confidence_new(pnl_std, trajectory_std=None, pnl_mean=0, sample_count=100):
    """New confidence calculation"""
    # 1. Uncertainty component
    if pnl_std < 20:
        uncertainty_confidence = 0.9 - (pnl_std / 20) * 0.2
    elif pnl_std < 50:
        uncertainty_confidence = 0.7 - ((pnl_std - 20) / 30) * 0.4
    else:
        uncertainty_confidence = 0.3 - ((pnl_std - 50) / 50) * 0.2
    
    # 2. Return/Risk ratio component
    if pnl_std > 0:
        sharpe_like = pnl_mean / pnl_std
        
        if pnl_mean > 10:
            if sharpe_like > 0.5:
                return_confidence = 0.8 + min(0.15, sharpe_like * 0.1)
            elif sharpe_like > 0:
                return_confidence = 0.6 + sharpe_like * 0.4
            else:
                return_confidence = 0.5
        elif abs(pnl_mean) <= 10:
            return_confidence = 0.4 + sharpe_like * 0.2
        else:
            if sharpe_like < -0.5:
                return_confidence = 0.2 - min(0.1, abs(sharpe_like) * 0.05)
            else:
                return_confidence = 0.3 + (sharpe_like + 0.5) * 0.2
    else:
        return_confidence = 0.5
    
    # 3. Model certainty
    if sample_count > 1000:
        model_confidence = 0.8
    elif sample_count > 500:
        model_confidence = 0.7
    elif sample_count > 100:
        model_confidence = 0.6
    else:
        model_confidence = 0.4
    
    confidence = (0.35 * uncertainty_confidence + 
                 0.45 * return_confidence + 
                 0.20 * model_confidence)
    
    # Add noise
    noise = (hash(str(pnl_mean) + str(pnl_std)) % 100 - 50) / 5000.0
    confidence += noise
    
    return max(0.1, min(0.95, confidence))

# Test scenarios
print("Confidence Calculation Comparison\n")
print("Scenario                          | Old Conf | New Conf | Difference")
print("-" * 70)

scenarios = [
    ("High uncertainty, loss", 32.69, -10.46, 100),
    ("High uncertainty, profit", 32.69, 25.0, 100),
    ("Low uncertainty, profit", 15.0, 20.0, 100),
    ("Low uncertainty, loss", 15.0, -15.0, 100),
    ("Very high uncertainty", 75.0, 5.0, 100),
    ("Break-even", 25.0, 2.0, 100),
    ("Strong profit signal", 20.0, 40.0, 100),
    ("Strong loss signal", 20.0, -40.0, 100),
    ("Many samples", 30.0, 10.0, 1500),
    ("Few samples", 30.0, 10.0, 50),
]

for desc, std, mean, samples in scenarios:
    old_conf = calculate_confidence_old(std, None, mean)
    new_conf = calculate_confidence_new(std, None, mean, samples)
    diff = new_conf - old_conf
    
    print(f"{desc:<33} | {old_conf:.3f}   | {new_conf:.3f}   | {diff:+.3f}")

print("\nVariation Analysis:")
old_confs = [calculate_confidence_old(s[1], None, s[2]) for s in scenarios[:8]]
new_confs = [calculate_confidence_new(s[1], None, s[2], s[3]) for s in scenarios[:8]]

print(f"Old method std dev: {np.std(old_confs):.4f}")
print(f"New method std dev: {np.std(new_confs):.4f}")
print(f"Old method range: {min(old_confs):.3f} - {max(old_confs):.3f}")
print(f"New method range: {min(new_confs):.3f} - {max(new_confs):.3f}")