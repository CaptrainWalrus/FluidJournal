#!/usr/bin/env python3

"""
Data Health Check using DuckDB for LanceDB Vectors
Automated query to ensure data completeness and gradients before training
"""

import sys
import os
import lancedb
import json
import pandas as pd
import numpy as np
from pathlib import Path
from tqdm import tqdm

class DataHealthChecker:
    def __init__(self):
        self.db_path = Path(__file__).parent / "storage-agent" / "data" / "vectors"
        self.db = None
        self.table = None
        
    def connect(self):
        """Connect to LanceDB directly"""
        try:
            print("🔗 Connecting to LanceDB...")
            self.db = lancedb.connect(str(self.db_path))
            self.table = self.db.open_table("feature_vectors")
            print("✅ Connected successfully")
            return True
            
        except Exception as e:
            print(f"❌ Connection failed: {e}")
            return False
    
    def get_schema_info(self):
        """Get comprehensive schema information"""
        print("\n📋 SCHEMA ANALYSIS")
        print("=" * 50)
        
        # Get schema from LanceDB table
        schema = self.table.schema
        column_names = schema.names
        
        print(f"Total columns: {len(column_names)}")
        
        feature_cols = []
        metadata_cols = []
        
        for col_name in column_names:
            if 'feature' in col_name.lower() or col_name.startswith('f_'):
                feature_cols.append(col_name)
            else:
                metadata_cols.append(col_name)
            print(f"  {col_name}: {schema.field(col_name).type}")
        
        return {
            'total_columns': len(column_names),
            'feature_columns': feature_cols,
            'metadata_columns': metadata_cols,
            'all_columns': column_names
        }
    
    def check_data_completeness(self, schema_info):
        """Check non-null coverage across all fields"""
        print("\n📊 DATA COMPLETENESS ANALYSIS")
        print("=" * 50)
        
        # Get all records
        all_records = self.table.search().limit(999999).to_pandas()
        total_count = len(all_records)
        print(f"Total records: {total_count:,}")
        
        if total_count == 0:
            print("❌ No data found!")
            return None
        
        # Check completeness for each column
        completeness_results = []
        
        print("\nAnalyzing column completeness...")
        for col_name in tqdm(schema_info['all_columns'], desc="Checking columns"):
            try:
                if col_name in all_records.columns:
                    # Count non-null values
                    non_null_count = all_records[col_name].notna().sum()
                    coverage = (non_null_count / total_count) * 100
                    completeness_results.append({
                        'column': col_name,
                        'non_null_count': non_null_count,
                        'coverage_percent': coverage
                    })
                else:
                    completeness_results.append({
                        'column': col_name,
                        'non_null_count': 0,
                        'coverage_percent': 0,
                        'error': 'Column not in DataFrame'
                    })
                
            except Exception as e:
                print(f"⚠️  Error checking {col_name}: {e}")
                completeness_results.append({
                    'column': col_name,
                    'non_null_count': 0,
                    'coverage_percent': 0,
                    'error': str(e)
                })
        
        # Sort by coverage
        completeness_results.sort(key=lambda x: x['coverage_percent'], reverse=True)
        
        # Print results
        print(f"\n{'Column':<30} {'Coverage':<10} {'Non-Null Count':<15}")
        print("-" * 55)
        
        critical_fields = ['pnl', 'features', 'instrument', 'direction', 'entryType']
        for result in completeness_results:
            coverage = result['coverage_percent']
            col_name = result['column']
            
            # Color coding
            if coverage >= 95:
                status = "✅"
            elif coverage >= 80:
                status = "⚠️ "
            else:
                status = "❌"
                
            # Mark critical fields
            critical_marker = " [CRITICAL]" if col_name in critical_fields else ""
            
            print(f"{status} {col_name:<28} {coverage:>6.1f}%    {result['non_null_count']:>10,}{critical_marker}")
        
        return completeness_results
    
    def analyze_data_gradients(self, schema_info):
        """Analyze data distributions and gradients"""
        print("\n📈 DATA GRADIENT ANALYSIS")
        print("=" * 50)
        
        # Get all records as pandas DataFrame
        all_records = self.table.search().limit(999999).to_pandas()
        
        # Analyze key fields
        gradient_analyses = []
        
        # PnL distribution
        print("\n💰 PnL Distribution:")
        try:
            if 'pnl' in all_records.columns:
                pnl_data = all_records['pnl']
                total_trades = len(all_records)
                with_pnl = pnl_data.notna().sum()
                min_pnl = pnl_data.min()
                max_pnl = pnl_data.max()
                avg_pnl = pnl_data.mean()
                std_pnl = pnl_data.std()
                winners = (pnl_data > 0).sum()
                losers = (pnl_data < 0).sum()
                unique_values = pnl_data.nunique()
                
                if with_pnl > 0:
                    win_rate = (winners / with_pnl) * 100
                    print(f"  Records with PnL: {with_pnl:,} / {total_trades:,} ({with_pnl/total_trades*100:.1f}%)")
                    print(f"  PnL Range: ${min_pnl:.2f} to ${max_pnl:.2f}")
                    print(f"  Average PnL: ${avg_pnl:.2f} ± ${std_pnl:.2f}")
                    print(f"  Win Rate: {win_rate:.1f}% ({winners:,} wins, {losers:,} losses)")
                    print(f"  Unique PnL values: {unique_values:,}")
                    
                    # Check for variance (critical for training)
                    if std_pnl < 0.01:
                        print("  ❌ CRITICAL: Near-zero PnL variance!")
                    elif unique_values < 10:
                        print("  ⚠️  WARNING: Very few unique PnL values")
                    else:
                        print("  ✅ Good PnL variance for training")
                else:
                    print("  ❌ No PnL data found!")
            else:
                print("  ❌ PnL column not found!")
                
        except Exception as e:
            print(f"  ❌ Error analyzing PnL: {e}")
        
        # Instrument/Direction distribution
        print("\n🎯 Instrument/Direction Distribution:")
        try:
            if 'instrument' in all_records.columns and 'direction' in all_records.columns:
                # Group by instrument and direction
                grouped = all_records.groupby(['instrument', 'direction']).agg({
                    'pnl': ['count', 'mean'],
                    'id': 'count'  # Total count
                }).round(2)
                
                # Flatten column names
                grouped.columns = ['pnl_count', 'avg_pnl', 'total_count']
                grouped = grouped.sort_values('total_count', ascending=False)
                
                for (instrument, direction), row in grouped.iterrows():
                    count = int(row['total_count'])
                    with_outcomes = int(row['pnl_count'])
                    avg_pnl = row['avg_pnl']
                    
                    outcome_rate = (with_outcomes / count) * 100 if count > 0 else 0
                    avg_display = f"${avg_pnl:.2f}" if pd.notna(avg_pnl) else "N/A"
                    print(f"  {instrument} {direction}: {count:,} records ({outcome_rate:.1f}% with outcomes, avg: {avg_display})")
            else:
                print("  ❌ Missing instrument/direction columns")
                
        except Exception as e:
            print(f"  ❌ Error analyzing instrument/direction: {e}")
        
        # Record type distribution
        print("\n📋 Record Type Distribution:")
        try:
            if 'recordType' in all_records.columns:
                # Group by record type
                record_stats = all_records.groupby(all_records['recordType'].fillna('NULL')).agg({
                    'id': 'count',
                    'pnl': lambda x: x.notna().sum()
                })
                record_stats.columns = ['count', 'with_pnl']
                record_stats = record_stats.sort_values('count', ascending=False)
                
                for record_type, row in record_stats.iterrows():
                    count = int(row['count'])
                    with_pnl = int(row['with_pnl'])
                    pnl_rate = (with_pnl / count) * 100 if count > 0 else 0
                    print(f"  {record_type}: {count:,} records ({pnl_rate:.1f}% with PnL)")
            else:
                print("  ⚠️  No recordType column found")
                
        except Exception as e:
            print(f"  ❌ Error analyzing record types: {e}")
        
        return gradient_analyses
    
    def check_training_readiness(self):
        """Assess training readiness with specific criteria"""
        print("\n🎯 TRAINING READINESS ASSESSMENT")
        print("=" * 50)
        
        readiness_score = 0
        max_score = 0
        issues = []
        
        try:
            # Get all records
            all_records = self.table.search().limit(999999).to_pandas()
            
            # Check 1: Sufficient data volume
            max_score += 20
            total_count = len(all_records)
            if total_count >= 1000:
                readiness_score += 20
                print(f"✅ Data Volume: {total_count:,} records (≥1,000 required)")
            else:
                print(f"❌ Data Volume: {total_count:,} records (insufficient)")
                issues.append(f"Need at least 1,000 records, have {total_count}")
            
            # Check 2: PnL data quality
            max_score += 25
            if 'pnl' in all_records.columns:
                pnl_series = all_records['pnl'].dropna()
                with_pnl = len(pnl_series)
                pnl_variance = pnl_series.std() if len(pnl_series) > 0 else 0
                unique_pnls = pnl_series.nunique()
                
                if with_pnl >= 500 and pnl_variance > 5 and unique_pnls >= 20:
                    readiness_score += 25
                    print(f"✅ PnL Quality: {with_pnl:,} records, σ=${pnl_variance:.2f}, {unique_pnls} unique values")
                else:
                    print(f"❌ PnL Quality: {with_pnl:,} records, σ=${pnl_variance:.2f}, {unique_pnls} unique")
                    issues.append("Insufficient PnL variance or coverage")
            else:
                print(f"❌ PnL Quality: No PnL column found")
                issues.append("Missing PnL data")
            
            # Check 3: Feature completeness
            max_score += 20
            if 'features' in all_records.columns:
                feature_completeness = all_records['features'].notna().sum()
                feature_rate = (feature_completeness / total_count) * 100 if total_count > 0 else 0
                
                if feature_rate >= 80:
                    readiness_score += 20
                    print(f"✅ Feature Completeness: {feature_rate:.1f}% ({feature_completeness:,} records)")
                else:
                    print(f"❌ Feature Completeness: {feature_rate:.1f}% (need ≥80%)")
                    issues.append("Insufficient feature coverage")
            else:
                print(f"❌ Feature Completeness: No features column")
                issues.append("Missing features")
            
            # Check 4: Instrument/Direction balance
            max_score += 20
            if 'instrument' in all_records.columns and 'direction' in all_records.columns:
                # Count combinations
                combinations = all_records.groupby(['instrument', 'direction']).size()
                num_combinations = len(combinations)
                min_per_combo = combinations.min() if len(combinations) > 0 else 0
                
                if num_combinations >= 2 and min_per_combo >= 100:
                    readiness_score += 20
                    print(f"✅ Data Balance: {num_combinations} instrument/direction combos, min {min_per_combo:,} each")
                else:
                    print(f"❌ Data Balance: {num_combinations} combos, min {min_per_combo} records")
                    issues.append("Insufficient data balance across instruments/directions")
            else:
                print(f"❌ Data Balance: Missing instrument/direction columns")
                issues.append("Missing instrument/direction data")
            
            # Check 5: Trajectory data (if available)
            max_score += 15
            if 'profitByBarJson' in all_records.columns:
                trajectory_mask = all_records['profitByBarJson'].notna() & (all_records['profitByBarJson'] != '{}')
                trajectory_count = trajectory_mask.sum()
                trajectory_rate = (trajectory_count / total_count) * 100 if total_count > 0 else 0
                
                if trajectory_rate >= 50:
                    readiness_score += 15
                    print(f"✅ Trajectory Data: {trajectory_rate:.1f}% ({trajectory_count:,} records)")
                elif trajectory_rate >= 20:
                    readiness_score += 10
                    print(f"⚠️  Trajectory Data: {trajectory_rate:.1f}% (partial coverage)")
                else:
                    print(f"❌ Trajectory Data: {trajectory_rate:.1f}% (insufficient)")
                    issues.append("Limited trajectory data for sequence modeling")
            else:
                print(f"❌ Trajectory Data: No profitByBarJson column")
                issues.append("Missing trajectory data")
            
        except Exception as e:
            print(f"❌ Assessment error: {e}")
            issues.append(f"Assessment error: {e}")
        
        # Final score
        print(f"\n🏆 TRAINING READINESS SCORE: {readiness_score}/{max_score} ({readiness_score/max_score*100:.1f}%)")
        
        if readiness_score >= max_score * 0.8:
            print("✅ READY FOR TRAINING!")
        elif readiness_score >= max_score * 0.6:
            print("⚠️  TRAINING POSSIBLE WITH CAVEATS")
        else:
            print("❌ NOT READY FOR TRAINING")
        
        if issues:
            print("\n🔧 Issues to Address:")
            for i, issue in enumerate(issues, 1):
                print(f"  {i}. {issue}")
        
        return {
            'score': readiness_score,
            'max_score': max_score,
            'percentage': readiness_score/max_score*100,
            'issues': issues,
            'ready': readiness_score >= max_score * 0.6
        }
    
    def run_health_check(self):
        """Run complete health check"""
        print("🏥 LANCEDB DATA HEALTH CHECK")
        print("=" * 50)
        
        if not self.connect():
            return False
        
        try:
            # Get schema information
            schema_info = self.get_schema_info()
            
            # Check completeness
            completeness = self.check_data_completeness(schema_info)
            
            # Analyze gradients
            gradients = self.analyze_data_gradients(schema_info)
            
            # Check training readiness
            readiness = self.check_training_readiness()
            
            print(f"\n{'='*50}")
            print("📋 HEALTH CHECK COMPLETE")
            print(f"{'='*50}")
            
            return readiness['ready']
            
        except Exception as e:
            print(f"❌ Health check failed: {e}")
            return False

if __name__ == "__main__":
    checker = DataHealthChecker()
    ready = checker.run_health_check()
    
    if ready:
        print("\n🚀 Proceeding to GPU training setup...")
        sys.exit(0)
    else:
        print("\n⏸️  Address data issues before training")
        sys.exit(1)