#!/usr/bin/env python3
"""
Create test training data with realistic PnL distributions
"""

import json
import numpy as np
import os

def create_test_training_data():
    """Create test data with realistic trading outcomes"""
    
    # Simulate 500 trades
    n_samples = 500
    n_features = 100
    
    # Generate random features with some structure
    features = []
    for i in range(n_samples):
        # Base features with noise
        base_features = np.random.randn(n_features) * 0.5
        
        # Add some market-like structure
        base_features[0] = np.random.uniform(0.3, 0.7)  # RSI-like
        base_features[1] = np.random.uniform(-2, 2)     # Momentum
        base_features[2] = np.random.uniform(2700, 2800) # Price
        
        features.append(base_features.tolist())
    
    # Generate realistic PnL distribution
    # 40% losers, 40% winners, 20% breakeven
    pnl_targets = []
    for i in range(n_samples):
        rand = np.random.random()
        if rand < 0.4:  # Losses
            pnl = np.random.normal(-75, 25)  # Average loss $75
            pnl = max(pnl, -150)  # Cap at -$150
        elif rand < 0.8:  # Wins  
            pnl = np.random.normal(100, 30)  # Average win $100
            pnl = min(pnl, 200)  # Cap at $200
        else:  # Breakeven
            pnl = np.random.normal(0, 10)
        
        pnl_targets.append(round(pnl, 2))
    
    # Generate trajectories based on PnL
    trajectory_targets = []
    for pnl in pnl_targets:
        if pnl > 0:  # Winner
            trajectory = [0, pnl * 0.3, pnl * 0.7, pnl]
        elif pnl < 0:  # Loser
            trajectory = [0, pnl * 0.5, pnl * 0.8, pnl]
        else:  # Breakeven
            trajectory = [0, 5, -5, pnl]
        
        trajectory_targets.append(trajectory[:3])  # Use 3 points
    
    # Generate risk targets based on market conditions
    risk_targets = []
    for i, pnl in enumerate(pnl_targets):
        # Vary SL/TP based on volatility (feature 0)
        volatility = features[i][0]
        
        sl = 30 + volatility * 40  # 30-70 range
        tp = 80 + (1 - volatility) * 80  # 80-160 range
        
        risk_targets.append([round(sl, 2), round(tp, 2)])
    
    # Create feature names
    feature_names = [f"feature_{i}" for i in range(n_features)]
    feature_names[0] = "rsi_14"
    feature_names[1] = "momentum_5"
    feature_names[2] = "close_price"
    
    # Create training file
    training_data = {
        "instrument": "MGC",
        "direction": "long",
        "data": {
            "features": features,
            "pnl_targets": pnl_targets,
            "trajectory_targets": trajectory_targets,
            "risk_targets": risk_targets,
            "feature_names": feature_names
        }
    }
    
    # Save test data
    os.makedirs('./training_data', exist_ok=True)
    
    with open('./training_data/MGC_long_test_training.json', 'w') as f:
        json.dump(training_data, f, indent=2)
    
    # Print statistics
    pnl_array = np.array(pnl_targets)
    print("Test data created successfully!")
    print(f"\nPnL Statistics:")
    print(f"  Mean: ${np.mean(pnl_array):.2f}")
    print(f"  Std: ${np.std(pnl_array):.2f}")
    print(f"  Min: ${np.min(pnl_array):.2f}")
    print(f"  Max: ${np.max(pnl_array):.2f}")
    print(f"  Winners: {np.sum(pnl_array > 0)} ({np.sum(pnl_array > 0)/len(pnl_array)*100:.1f}%)")
    print(f"  Losers: {np.sum(pnl_array < 0)} ({np.sum(pnl_array < 0)/len(pnl_array)*100:.1f}%)")
    print(f"\nRisk Statistics:")
    risk_array = np.array(risk_targets)
    print(f"  SL range: [{np.min(risk_array[:, 0]):.0f}, {np.max(risk_array[:, 0]):.0f}]")
    print(f"  TP range: [{np.min(risk_array[:, 1]):.0f}, {np.max(risk_array[:, 1]):.0f}]")
    print(f"\nSaved to: ./training_data/MGC_long_test_training.json")

if __name__ == "__main__":
    create_test_training_data()