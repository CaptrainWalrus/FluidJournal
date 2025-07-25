#!/usr/bin/env python3
"""
Diagnostic script to analyze training data quality issues
"""

import json
import numpy as np
import os
from collections import Counter

def diagnose_training_file(filepath):
    """Analyze a single training file"""
    print(f"\n{'='*60}")
    print(f"Analyzing: {os.path.basename(filepath)}")
    print('='*60)
    
    with open(filepath, 'r') as f:
        data = json.load(f)
    
    if 'data' not in data:
        print("❌ Missing 'data' key in file")
        return
    
    # Extract arrays
    features = np.array(data['data']['features'])
    pnl_targets = np.array(data['data']['pnl_targets'])
    trajectory_targets = np.array(data['data']['trajectory_targets'])
    risk_targets = np.array(data['data']['risk_targets'])
    
    print(f"\n📊 Data Shape:")
    print(f"  Features: {features.shape}")
    print(f"  PnL targets: {pnl_targets.shape}")
    print(f"  Trajectory targets: {trajectory_targets.shape}")
    print(f"  Risk targets: {risk_targets.shape}")
    
    # PnL Analysis
    print(f"\n💰 PnL Analysis:")
    print(f"  Mean: ${np.mean(pnl_targets):.2f}")
    print(f"  Std: ${np.std(pnl_targets):.2f}")
    print(f"  Min: ${np.min(pnl_targets):.2f}")
    print(f"  Max: ${np.max(pnl_targets):.2f}")
    print(f"  Variance: {np.var(pnl_targets):.6f}")
    
    # Count unique values
    unique_pnls = np.unique(pnl_targets)
    print(f"  Unique values: {len(unique_pnls)}")
    
    if len(unique_pnls) <= 10:
        print("  Value counts:")
        pnl_counts = Counter(pnl_targets)
        for pnl, count in pnl_counts.most_common():
            print(f"    ${pnl:.2f}: {count} trades ({count/len(pnl_targets)*100:.1f}%)")
    
    # Zero check
    zero_pnls = np.sum(np.abs(pnl_targets) < 0.01)
    print(f"  Near-zero PnLs: {zero_pnls}/{len(pnl_targets)} ({zero_pnls/len(pnl_targets)*100:.1f}%)")
    
    # Feature variance analysis
    print(f"\n🔍 Feature Analysis:")
    feature_vars = np.var(features, axis=0)
    zero_var_features = np.sum(feature_vars < 1e-10)
    print(f"  Zero variance features: {zero_var_features}/{features.shape[1]}")
    
    if zero_var_features > 0:
        zero_var_indices = np.where(feature_vars < 1e-10)[0]
        print(f"  Indices: {zero_var_indices[:10]}..." if len(zero_var_indices) > 10 else f"  Indices: {zero_var_indices}")
    
    # Risk targets analysis
    print(f"\n🎯 Risk Targets Analysis:")
    print(f"  SL range: [{np.min(risk_targets[:, 0]):.2f}, {np.max(risk_targets[:, 0]):.2f}]")
    print(f"  TP range: [{np.min(risk_targets[:, 1]):.2f}, {np.max(risk_targets[:, 1]):.2f}]")
    print(f"  SL variance: {np.var(risk_targets[:, 0]):.2f}")
    print(f"  TP variance: {np.var(risk_targets[:, 1]):.2f}")
    
    # Trajectory analysis
    print(f"\n📈 Trajectory Analysis:")
    if trajectory_targets.shape[1] > 0:
        final_values = trajectory_targets[:, -1]
        print(f"  Final value mean: ${np.mean(final_values):.2f}")
        print(f"  Final value std: ${np.std(final_values):.2f}")
        print(f"  Matches PnL: {np.allclose(final_values, pnl_targets)}")
    
    # Data quality warnings
    print(f"\n⚠️  Warnings:")
    warnings = []
    
    if np.var(pnl_targets) < 1e-6:
        warnings.append("❌ CRITICAL: PnL has zero variance - all trades have same outcome!")
    
    if zero_pnls > len(pnl_targets) * 0.8:
        warnings.append("❌ CRITICAL: >80% of trades have zero PnL!")
    
    if zero_var_features > features.shape[1] * 0.3:
        warnings.append("⚠️  >30% of features have zero variance")
    
    if len(unique_pnls) < 5:
        warnings.append("⚠️  Very few unique PnL values - possible data issue")
    
    if np.all(risk_targets[:, 0] == risk_targets[0, 0]):
        warnings.append("⚠️  All stop losses are identical")
    
    if np.all(risk_targets[:, 1] == risk_targets[0, 1]):
        warnings.append("⚠️  All take profits are identical")
    
    if len(warnings) == 0:
        print("  ✅ No major issues detected")
    else:
        for warning in warnings:
            print(f"  {warning}")
    
    return {
        'file': os.path.basename(filepath),
        'n_samples': len(features),
        'pnl_variance': np.var(pnl_targets),
        'zero_pnls_pct': zero_pnls/len(pnl_targets)*100,
        'warnings': len(warnings)
    }

def main():
    """Analyze all training files"""
    print("🔍 Training Data Diagnostics")
    print("="*60)
    
    training_dir = './training_data'
    if not os.path.exists(training_dir):
        print(f"❌ Training directory not found: {training_dir}")
        return
    
    # Find all training files
    training_files = [f for f in os.listdir(training_dir) 
                     if f.endswith('_training.json') and not f.startswith('export')]
    
    if not training_files:
        print("❌ No training files found")
        return
    
    print(f"Found {len(training_files)} training files")
    
    # Analyze each file
    results = []
    for filename in sorted(training_files):
        filepath = os.path.join(training_dir, filename)
        result = diagnose_training_file(filepath)
        if result:
            results.append(result)
    
    # Summary
    print(f"\n{'='*60}")
    print("📊 SUMMARY")
    print('='*60)
    
    total_warnings = sum(r['warnings'] for r in results)
    zero_var_files = sum(1 for r in results if r['pnl_variance'] < 1e-6)
    
    print(f"Total files analyzed: {len(results)}")
    print(f"Files with zero PnL variance: {zero_var_files}")
    print(f"Total warnings: {total_warnings}")
    
    if zero_var_files > 0:
        print("\n❌ CRITICAL ISSUE: Some files have zero PnL variance!")
        print("This means all trades have the same outcome (likely $0)")
        print("Check your data export - outcome data may be missing!")

if __name__ == "__main__":
    main()