#!/usr/bin/env node

/**
 * Direct LanceDB query to check total records
 */

const lancedb = require('vectordb');
const path = require('path');

async function checkTotalRecords() {
    try {
        console.log('🔍 Checking total records in LanceDB...\n');
        
        const dbPath = path.join(__dirname, 'storage-agent', 'data', 'vectors');
        console.log('Database path:', dbPath);
        
        const db = await lancedb.connect(dbPath);
        console.log('✅ Connected to LanceDB');
        
        const table = await db.openTable('feature_vectors');
        console.log('✅ Opened feature_vectors table');
        
        // Get total count
        const allRecords = await table.search([]).limit(999999).execute();
        const totalCount = allRecords.length;
        
        console.log(`\n📊 Total Records: ${totalCount}`);
        
        if (totalCount > 0) {
            // Analyze record types
            const recordTypes = {};
            const instruments = new Set();
            const directions = new Set();
            
            allRecords.forEach(record => {
                const recordType = record.recordType || 'UNKNOWN';
                recordTypes[recordType] = (recordTypes[recordType] || 0) + 1;
                
                if (record.instrument) instruments.add(record.instrument);
                if (record.direction) directions.add(record.direction);
            });
            
            console.log('\n📋 Record Type Breakdown:');
            Object.entries(recordTypes).forEach(([type, count]) => {
                console.log(`  ${type}: ${count} records`);
            });
            
            console.log('\n🎯 Instruments:', Array.from(instruments).join(', '));
            console.log('📈 Directions:', Array.from(directions).join(', '));
            
            // Check for complete records (features + outcomes)
            const unifiedRecords = allRecords.filter(r => 
                r.recordType === 'UNIFIED' || 
                (r.features && r.features.length > 0 && r.pnl !== undefined)
            );
            
            console.log(`\n💡 Records suitable for training: ${unifiedRecords.length}`);
            
            if (unifiedRecords.length > 0) {
                // Analyze training data quality
                const byInstrumentDirection = {};
                unifiedRecords.forEach(record => {
                    const key = `${record.instrument}_${record.direction}`;
                    if (!byInstrumentDirection[key]) {
                        byInstrumentDirection[key] = [];
                    }
                    byInstrumentDirection[key].push(record);
                });
                
                console.log('\n📊 Training Data by Instrument/Direction:');
                Object.entries(byInstrumentDirection).forEach(([key, records]) => {
                    const profitable = records.filter(r => (r.pnl || 0) > 0).length;
                    const winRate = (profitable / records.length * 100).toFixed(1);
                    console.log(`  ${key}: ${records.length} trades (${winRate}% win rate)`);
                });
            }
        } else {
            console.log('\n❌ No records found in database');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.message.includes('No such file')) {
            console.log('\n💡 Database file not found. Make sure Storage Agent has been used to store data.');
        }
    }
}

checkTotalRecords();