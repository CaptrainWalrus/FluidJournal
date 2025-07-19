#!/usr/bin/env python3

"""
Query LanceDB using DuckDB for SQL-like operations
"""

import sys
import os
import lancedb
import duckdb
import json
from pathlib import Path

def query_database():
    try:
        print("🔍 Querying LanceDB with DuckDB...\n")
        
        # Connect to LanceDB
        db_path = Path(__file__).parent / "storage-agent" / "data" / "vectors"
        print(f"Database path: {db_path}")
        
        db = lancedb.connect(str(db_path))
        print("✅ Connected to LanceDB")
        
        table = db.open_table("feature_vectors")
        print("✅ Opened feature_vectors table")
        
        # Convert to Lance dataset for DuckDB
        lance_dataset = table.to_lance()
        print("✅ Converted to Lance dataset")
        
        # Count total records
        result = duckdb.query("SELECT COUNT(*) as total_count FROM lance_dataset").fetchall()
        total_count = result[0][0]
        print(f"\n📊 Total Records: {total_count:,}")
        
        if total_count > 0:
            # Get schema info
            schema_result = duckdb.query("DESCRIBE lance_dataset").fetchall()
            print(f"\n📋 Schema ({len(schema_result)} columns):")
            for col_name, col_type, null, key, default, extra in schema_result:
                print(f"  {col_name}: {col_type}")
            
            # Record type breakdown
            record_types = duckdb.query("""
                SELECT recordType, COUNT(*) as count 
                FROM lance_dataset 
                GROUP BY recordType 
                ORDER BY count DESC
            """).fetchall()
            
            print("\n📋 Record Type Breakdown:")
            for record_type, count in record_types:
                print(f"  {record_type}: {count:,} records")
            
            # Instrument and direction breakdown
            instruments = duckdb.query("""
                SELECT instrument, direction, COUNT(*) as count 
                FROM lance_dataset 
                WHERE instrument IS NOT NULL AND direction IS NOT NULL
                GROUP BY instrument, direction 
                ORDER BY instrument, direction
            """).fetchall()
            
            print("\n🎯 Instrument/Direction Breakdown:")
            for instrument, direction, count in instruments:
                print(f"  {instrument} {direction}: {count:,} records")
            
            # Check for complete training data (records with both features and PnL)
            complete_records = duckdb.query("""
                SELECT COUNT(*) as complete_count
                FROM lance_dataset 
                WHERE (recordType = 'UNIFIED' OR recordType IS NULL)
                  AND features IS NOT NULL 
                  AND pnl IS NOT NULL
            """).fetchall()
            
            complete_count = complete_records[0][0]
            print(f"\n💡 Complete training records: {complete_count:,}")
            
            if complete_count > 0:
                # Analyze PnL distribution
                pnl_stats = duckdb.query("""
                    SELECT 
                        COUNT(*) as trades,
                        AVG(pnl) as avg_pnl,
                        MIN(pnl) as min_pnl,
                        MAX(pnl) as max_pnl,
                        COUNT(CASE WHEN pnl > 0 THEN 1 END) as winners,
                        COUNT(CASE WHEN pnl < 0 THEN 1 END) as losers
                    FROM lance_dataset 
                    WHERE (recordType = 'UNIFIED' OR recordType IS NULL)
                      AND pnl IS NOT NULL
                """).fetchall()
                
                trades, avg_pnl, min_pnl, max_pnl, winners, losers = pnl_stats[0]
                win_rate = (winners / trades * 100) if trades > 0 else 0
                
                print(f"\n💰 PnL Analysis ({trades:,} trades):")
                print(f"  Win Rate: {win_rate:.1f}% ({winners:,} wins, {losers:,} losses)")
                print(f"  Average PnL: ${avg_pnl:.2f}")
                print(f"  Range: ${min_pnl:.2f} to ${max_pnl:.2f}")
                
                # Breakdown by instrument/direction for training data
                training_breakdown = duckdb.query("""
                    SELECT 
                        instrument, 
                        direction, 
                        COUNT(*) as trades,
                        AVG(pnl) as avg_pnl,
                        COUNT(CASE WHEN pnl > 0 THEN 1 END) as winners
                    FROM lance_dataset 
                    WHERE (recordType = 'UNIFIED' OR recordType IS NULL)
                      AND pnl IS NOT NULL
                      AND instrument IS NOT NULL 
                      AND direction IS NOT NULL
                    GROUP BY instrument, direction 
                    ORDER BY trades DESC
                """).fetchall()
                
                print(f"\n📊 Training Data by Instrument/Direction:")
                for instrument, direction, trades, avg_pnl, winners in training_breakdown:
                    win_rate = (winners / trades * 100) if trades > 0 else 0
                    print(f"  {instrument} {direction}: {trades:,} trades, {win_rate:.1f}% win rate, ${avg_pnl:.2f} avg")
        
        return total_count, complete_count if total_count > 0 else 0
        
    except Exception as error:
        print(f"❌ Error: {error}")
        if "No such file" in str(error):
            print("\n💡 Database file not found. Make sure Storage Agent has stored data.")
        return 0, 0

if __name__ == "__main__":
    total, complete = query_database()
    
    if total > 1000:
        print(f"\n🚀 Recommendation: Export all {complete:,} complete records for GP training")
        print("   (Current export is limited to 1,000 records)")
    elif total > 0:
        print(f"\n✅ Current dataset size ({total:,} total, {complete:,} complete) is reasonable for training")
    else:
        print("\n❌ No data available for training")