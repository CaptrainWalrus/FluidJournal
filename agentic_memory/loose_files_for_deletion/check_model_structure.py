#!/usr/bin/env python3
import joblib

# Load the model
model_path = "/mnt/c/workspace/production-curves/Production/agentic_memory/gp-service/models/MGC_long_models.joblib"
model_data = joblib.load(model_path)

print("Model keys:", list(model_data.keys()))

if 'feature_selector' in model_data:
    selector = model_data['feature_selector']
    print(f"\nFeature selector expects: {selector.n_features_in_} features")
    print(f"Features kept after selection: {sum(selector.get_support())}")
    
if 'training_info' in model_data:
    info = model_data['training_info']
    print(f"\nTraining info:")
    print(f"  Original features: {info.get('n_features_original', 'N/A')}")
    print(f"  Used features: {info.get('n_features_used', 'N/A')}")
    print(f"  Samples: {info.get('n_samples', 'N/A')}")

if 'scaler' in model_data:
    scaler = model_data['scaler']
    if hasattr(scaler, 'n_features_in_'):
        print(f"\nScaler expects: {scaler.n_features_in_} features")

# Also check the separate scaler file
scaler_path = "/mnt/c/workspace/production-curves/Production/agentic_memory/gp-service/models/MGC_long_scaler.joblib"
scaler = joblib.load(scaler_path)
print(f"\nSeparate scaler file expects: {scaler.n_features_in_} features")