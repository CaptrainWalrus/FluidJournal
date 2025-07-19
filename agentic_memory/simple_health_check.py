#!/usr/bin/env python3

"""
Simple LanceDB Health Check for Training Readiness
Focus on key metrics needed for GP training
"""

import sys
import os
import lancedb
import pandas as pd
import numpy as np
from pathlib import Path
from tqdm import tqdm

class SimpleHealthChecker:
    def __init__(self):
        self.db_path = Path(__file__).parent / "storage-agent" / "data" / "vectors"
        self.db = None
        self.table = None
        self.data = None
        
    def connect_and_load(self):
        """Connect to LanceDB and load all data"""
        try:
            print("🔗 Connecting to LanceDB...")
            self.db = lancedb.connect(str(self.db_path))
            self.table = self.db.open_table("feature_vectors")
            
            print("📥 Loading all records...")
            # Load all data as pandas DataFrame
            self.data = self.table.search().limit(999999).to_pandas()
            
            print(f"✅ Loaded {len(self.data):,} records")
            return True
            
        except Exception as e:
            print(f"❌ Connection/loading failed: {e}")
            return False
    
    def analyze_data_quality(self):
        """Analyze data quality for training readiness"""
        if self.data is None or len(self.data) == 0:
            print("❌ No data to analyze!")
            return False
        
        print(f"\n📊 DATA QUALITY ANALYSIS")
        print("=" * 50)
        
        total_records = len(self.data)
        print(f"Total Records: {total_records:,}")
        
        # 1. Check critical fields
        critical_fields = ['pnl', 'features', 'instrument', 'direction', 'entryType']
        
        print(f"\n🎯 Critical Field Coverage:")
        for field in critical_fields:
            if field in self.data.columns:
                non_null = self.data[field].notna().sum()
                coverage = (non_null / total_records) * 100
                status = "✅" if coverage >= 80 else "⚠️ " if coverage >= 50 else "❌"
                print(f"  {status} {field}: {coverage:.1f}% ({non_null:,}/{total_records:,})")
            else:
                print(f"  ❌ {field}: Missing column")
        
        # 2. PnL Analysis
        print(f"\n💰 PnL Distribution Analysis:")
        if 'pnl' in self.data.columns:
            pnl_data = self.data['pnl'].dropna()
            if len(pnl_data) > 0:
                pnl_stats = {
                    'count': len(pnl_data),
                    'mean': pnl_data.mean(),
                    'std': pnl_data.std(),
                    'min': pnl_data.min(),
                    'max': pnl_data.max(),
                    'winners': (pnl_data > 0).sum(),
                    'losers': (pnl_data < 0).sum(),
                    'unique': pnl_data.nunique()
                }
                
                win_rate = (pnl_stats['winners'] / pnl_stats['count']) * 100
                
                print(f"  Records with PnL: {pnl_stats['count']:,}")
                print(f"  PnL Range: ${pnl_stats['min']:.2f} to ${pnl_stats['max']:.2f}")
                print(f"  Average PnL: ${pnl_stats['mean']:.2f} ± ${pnl_stats['std']:.2f}")
                print(f"  Win Rate: {win_rate:.1f}% ({pnl_stats['winners']:,} wins, {pnl_stats['losers']:,} losses)")
                print(f"  Unique PnL values: {pnl_stats['unique']:,}")
                
                # Variance check
                if pnl_stats['std'] < 1.0:
                    print(f"  ⚠️  WARNING: Low PnL variance (σ=${pnl_stats['std']:.2f})")
                elif pnl_stats['unique'] < 10:
                    print(f"  ⚠️  WARNING: Very few unique PnL values ({pnl_stats['unique']})")
                else:
                    print(f"  ✅ Good PnL variance for training")
            else:
                print(f"  ❌ No valid PnL data found!")
        else:
            print(f"  ❌ PnL column missing!")
        
        # 3. Instrument/Direction Distribution
        print(f"\n🎯 Instrument/Direction Distribution:")
        if 'instrument' in self.data.columns and 'direction' in self.data.columns:
            inst_dir_counts = self.data.groupby(['instrument', 'direction']).size().reset_index(name='count')
            inst_dir_counts = inst_dir_counts.sort_values('count', ascending=False)
            
            for _, row in inst_dir_counts.iterrows():
                instrument, direction, count = row['instrument'], row['direction'], row['count']
                
                # Calculate PnL stats for this combo if possible
                subset = self.data[(self.data['instrument'] == instrument) & 
                                 (self.data['direction'] == direction)]
                
                pnl_info = ""
                if 'pnl' in subset.columns:
                    pnl_subset = subset['pnl'].dropna()
                    if len(pnl_subset) > 0:
                        avg_pnl = pnl_subset.mean()
                        win_rate = (pnl_subset > 0).mean() * 100
                        pnl_info = f", avg: ${avg_pnl:.2f}, {win_rate:.1f}% wins"
                
                print(f"  {instrument} {direction}: {count:,} records{pnl_info}")
        else:
            print(f"  ❌ Missing instrument/direction columns!")
        
        # 4. Record Type Analysis
        print(f"\n📋 Record Type Distribution:")
        if 'recordType' in self.data.columns:
            type_counts = self.data['recordType'].value_counts()
            for record_type, count in type_counts.items():
                pct = (count / total_records) * 100
                print(f"  {record_type}: {count:,} ({pct:.1f}%)")
        else:
            print(f"  ⚠️  No recordType column found")
        
        # 5. Feature Data Analysis
        print(f"\n🔢 Feature Data Analysis:")
        if 'features' in self.data.columns:
            features_available = self.data['features'].notna().sum()
            features_rate = (features_available / total_records) * 100
            print(f"  Records with features: {features_available:,}/{total_records:,} ({features_rate:.1f}%)")
            
            # Check if features are arrays/lists
            sample_feature = self.data['features'].dropna().iloc[0] if features_available > 0 else None
            if sample_feature is not None:
                try:
                    if isinstance(sample_feature, (list, np.ndarray)):
                        feature_length = len(sample_feature)
                        print(f"  Feature vector length: {feature_length}")
                    else:
                        print(f"  Feature type: {type(sample_feature)}")
                except:
                    print(f"  ⚠️  Cannot determine feature structure")
        else:
            print(f"  ❌ No features column found!")
        
        return True
    
    def check_training_readiness(self):
        """Final training readiness assessment"""
        print(f"\n🎯 TRAINING READINESS ASSESSMENT")
        print("=" * 50)
        
        if self.data is None:
            print("❌ No data available")
            return False
        
        total_records = len(self.data)
        issues = []
        score = 0
        max_score = 100
        
        # Check 1: Sufficient data volume (20 points)
        if total_records >= 1000:
            score += 20
            print(f"✅ Data Volume: {total_records:,} records (≥1,000 required)")
        else:
            print(f"❌ Data Volume: {total_records:,} records (need ≥1,000)")
            issues.append("Insufficient data volume")
        
        # Check 2: PnL data quality (30 points)
        if 'pnl' in self.data.columns:
            pnl_data = self.data['pnl'].dropna()
            if len(pnl_data) >= 500:
                pnl_std = pnl_data.std()
                unique_pnls = pnl_data.nunique()
                
                if pnl_std > 5 and unique_pnls >= 20:
                    score += 30
                    print(f"✅ PnL Quality: {len(pnl_data):,} records, σ=${pnl_std:.2f}, {unique_pnls} unique")
                else:
                    score += 15
                    print(f"⚠️  PnL Quality: Limited variance or diversity")
                    issues.append("PnL data quality concerns")
            else:
                print(f"❌ PnL Quality: Only {len(pnl_data):,} records with PnL")
                issues.append("Insufficient PnL data")
        else:
            print(f"❌ PnL Quality: No PnL column found")
            issues.append("Missing PnL data")
        
        # Check 3: Feature availability (25 points)
        if 'features' in self.data.columns:
            features_available = self.data['features'].notna().sum()
            feature_rate = (features_available / total_records) * 100
            
            if feature_rate >= 80:
                score += 25
                print(f"✅ Feature Coverage: {feature_rate:.1f}% ({features_available:,} records)")
            elif feature_rate >= 50:
                score += 15
                print(f"⚠️  Feature Coverage: {feature_rate:.1f}% (need ≥80%)")
                issues.append("Limited feature coverage")
            else:
                print(f"❌ Feature Coverage: {feature_rate:.1f}% (insufficient)")
                issues.append("Insufficient feature coverage")
        else:
            print(f"❌ Feature Coverage: No features column")
            issues.append("Missing features")
        
        # Check 4: Instrument/Direction balance (25 points)
        if 'instrument' in self.data.columns and 'direction' in self.data.columns:
            combinations = self.data.groupby(['instrument', 'direction']).size()
            
            if len(combinations) >= 2 and combinations.min() >= 100:
                score += 25
                print(f"✅ Data Balance: {len(combinations)} combos, min {combinations.min():,} each")
            elif len(combinations) >= 2:
                score += 15
                print(f"⚠️  Data Balance: {len(combinations)} combos, min {combinations.min()} each")
                issues.append("Unbalanced data distribution")
            else:
                print(f"❌ Data Balance: Only {len(combinations)} combinations")
                issues.append("Insufficient data diversity")
        else:
            print(f"❌ Data Balance: Missing instrument/direction columns")
            issues.append("Missing instrument/direction data")
        
        # Final assessment
        percentage = score / max_score * 100
        print(f"\n🏆 TRAINING READINESS SCORE: {score}/{max_score} ({percentage:.1f}%)")
        
        if percentage >= 80:
            print("✅ READY FOR TRAINING!")
            ready = True
        elif percentage >= 60:
            print("⚠️  TRAINING POSSIBLE WITH CAVEATS")
            ready = True
        else:
            print("❌ NOT READY FOR TRAINING")
            ready = False
        
        if issues:
            print(f"\n🔧 Issues to Address:")
            for i, issue in enumerate(issues, 1):
                print(f"  {i}. {issue}")
        
        return ready
    
    def run_health_check(self):
        """Run complete health check"""
        print("🏥 SIMPLE LANCEDB HEALTH CHECK")
        print("=" * 50)
        
        # Step 1: Connect and load data
        if not self.connect_and_load():
            return False
        
        # Step 2: Analyze data quality
        if not self.analyze_data_quality():
            return False
        
        # Step 3: Check training readiness
        ready = self.check_training_readiness()
        
        print(f"\n{'='*50}")
        print("📋 HEALTH CHECK COMPLETE")
        print(f"{'='*50}")
        
        return ready

if __name__ == "__main__":
    checker = SimpleHealthChecker()
    ready = checker.run_health_check()
    
    if ready:
        print("\n🚀 Data is ready for GPU training!")
        sys.exit(0)
    else:
        print("\n⏸️  Address data issues before training")
        sys.exit(1)