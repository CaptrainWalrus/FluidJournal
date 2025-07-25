#!/usr/bin/env node

/**
 * Debug script to check actual Storage Agent data structure
 */

const http = require('http');

function fetchStorageData() {
    const options = {
        hostname: 'localhost',
        port: 3015,
        path: '/api/vectors?limit=5',
        method: 'GET'
    };

    const req = http.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
            data += chunk;
        });
        
        res.on('end', () => {
            try {
                const result = JSON.parse(data);
                
                console.log('='.repeat(60));
                console.log('STORAGE AGENT DATA STRUCTURE ANALYSIS');
                console.log('='.repeat(60));
                
                // Check top level structure
                console.log('\n📊 Response Structure:');
                console.log('  Top-level keys:', Object.keys(result).join(', '));
                
                if (result.vectors && Array.isArray(result.vectors)) {
                    console.log('  Vectors array length:', result.vectors.length);
                    
                    if (result.vectors.length > 0) {
                        const first = result.vectors[0];
                        
                        console.log('\n📋 First Record Analysis:');
                        console.log('  Record keys:', Object.keys(first).join(', '));
                        console.log('  Has outcome:', first.outcome ? 'Yes' : 'No');
                        console.log('  Has features:', first.features ? 'Yes' : 'No');
                        
                        // Check outcome structure
                        if (first.outcome) {
                            console.log('\n💰 Outcome Structure:');
                            console.log('  Outcome keys:', Object.keys(first.outcome).join(', '));
                            console.log('  outcome.pnl:', first.outcome.pnl);
                            console.log('  outcome.pnlDollars:', first.outcome.pnlDollars);
                            console.log('  outcome.PnLDollars:', first.outcome.PnLDollars);
                            console.log('  outcome.exitReason:', first.outcome.exitReason);
                            
                            // Show all outcome fields
                            console.log('\n  All outcome fields:');
                            Object.entries(first.outcome).forEach(([key, value]) => {
                                if (typeof value !== 'object') {
                                    console.log(`    ${key}: ${value}`);
                                }
                            });
                        }
                        
                        // Check direct PnL fields
                        console.log('\n💵 Direct PnL Fields:');
                        console.log('  record.pnl:', first.pnl);
                        console.log('  record.pnlDollars:', first.pnlDollars);
                        console.log('  record.PnLDollars:', first.PnLDollars);
                        
                        // Check features
                        if (first.features) {
                            console.log('\n🔢 Features:');
                            console.log('  Feature array length:', first.features.length);
                            console.log('  First 5 features:', first.features.slice(0, 5));
                        }
                        
                        // Check risk fields
                        console.log('\n🎯 Risk Fields:');
                        console.log('  record.riskUsed:', first.riskUsed);
                        console.log('  record.suggestedSl:', first.suggestedSl);
                        console.log('  record.suggestedTp:', first.suggestedTp);
                        if (first.riskUsed) {
                            console.log('  riskUsed keys:', Object.keys(first.riskUsed).join(', '));
                        }
                        
                        // Show first 3 records' PnL values
                        console.log('\n📈 PnL Values from First 3 Records:');
                        result.vectors.slice(0, 3).forEach((record, i) => {
                            const pnl = record.outcome?.pnl || 
                                       record.outcome?.pnlDollars || 
                                       record.outcome?.PnLDollars ||
                                       record.pnl || 
                                       record.pnlDollars || 
                                       record.PnLDollars || 
                                       'NOT FOUND';
                            console.log(`  Record ${i}: ${pnl}`);
                        });
                    }
                } else {
                    console.log('\n❌ No vectors array found in response!');
                    console.log('Full response:', JSON.stringify(result, null, 2).substring(0, 500) + '...');
                }
                
            } catch (error) {
                console.error('Failed to parse response:', error.message);
                console.log('Raw response:', data.substring(0, 500) + '...');
            }
        });
    });

    req.on('error', (err) => {
        console.error('❌ Failed to connect to Storage Agent:', err.message);
        console.log('Make sure Storage Agent is running on port 3015');
    });

    req.end();
}

// Run the debug
console.log('🔍 Debugging Storage Agent Data Structure...\n');
fetchStorageData();