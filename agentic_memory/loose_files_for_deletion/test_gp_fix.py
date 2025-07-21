#!/usr/bin/env python3
"""Test script to verify GP model loading fix"""

import joblib
import os
import json

# Check what's in the model file
model_path = "/mnt/c/workspace/production-curves/Production/agentic_memory/gp-service/models/MGC_long_models.joblib"

if os.path.exists(model_path):
    print(f"✅ Model file exists: {model_path}")
    
    # Load and inspect the model structure
    model_data = joblib.load(model_path)
    
    print("\n📊 Model structure:")
    print(f"Type: {type(model_data)}")
    
    if isinstance(model_data, dict):
        print(f"Keys: {list(model_data.keys())}")
        
        # Check for expected keys
        if 'pnl_gp' in model_data:
            print("✅ Found 'pnl_gp' (trainer format)")
            print(f"   - pnl_gp type: {type(model_data['pnl_gp'])}")
        
        if 'trained' in model_data:
            print("✅ Found 'trained' (service format)")
            
        if 'training_info' in model_data:
            print("✅ Found 'training_info':")
            info = model_data['training_info']
            print(f"   - n_samples: {info.get('n_samples', 'N/A')}")
            print(f"   - instrument: {info.get('instrument', 'N/A')}")
            print(f"   - direction: {info.get('direction', 'N/A')}")
            
        if 'feature_selector' in model_data:
            print("✅ Found 'feature_selector'")
            selector = model_data['feature_selector']
            if hasattr(selector, 'get_support'):
                n_features_kept = sum(selector.get_support())
                print(f"   - Features kept: {n_features_kept}")
                
else:
    print(f"❌ Model file not found: {model_path}")

# Also check scaler
scaler_path = "/mnt/c/workspace/production-curves/Production/agentic_memory/gp-service/models/MGC_long_scaler.joblib"
if os.path.exists(scaler_path):
    print(f"\n✅ Scaler file exists: {scaler_path}")
    scaler = joblib.load(scaler_path)
    print(f"   - Scaler type: {type(scaler)}")
    if hasattr(scaler, 'n_features_in_'):
        print(f"   - Expected features: {scaler.n_features_in_}")