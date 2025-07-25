#!/usr/bin/env python3
import json

# Load training data
with open('/mnt/c/workspace/production-curves/Production/agentic_memory/gp-service/training_data/MGC_long_training.json', 'r') as f:
    data = json.load(f)

print(f"Data keys: {list(data.keys())}")
print(f"Data.data keys: {list(data['data'].keys())}")

# Check feature dimensions
features = data['data']['features']
print(f"\nFeature array shape: {len(features)} samples x {len(features[0])} features")
print(f"First feature vector length: {len(features[0])}")

# Check if feature_names exists
if 'feature_names' in data['data']:
    feature_names = data['data']['feature_names']
    print(f"\nFound {len(feature_names)} feature names")
    print("First 10 feature names:", feature_names[:10])
    print("Last 10 feature names:", feature_names[-10:])
else:
    print("\nNo feature_names found in data")

# Check for padding
first_row = features[0]
zero_count = sum(1 for x in first_row if x == 0)
print(f"\nZeros in first row: {zero_count} out of {len(first_row)}")

# Find where padding starts
non_zero_indices = [i for i, val in enumerate(first_row) if val != 0]
if non_zero_indices:
    last_non_zero = max(non_zero_indices)
    print(f"Last non-zero feature at index: {last_non_zero}")
    print(f"Appears to have {last_non_zero + 1} actual features, padded to {len(first_row)}")