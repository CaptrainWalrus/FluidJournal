/**
 * Test script for Robust Zones Engine
 * Validates end-to-end functionality without modifying existing code
 */

const RobustZoneEngine = require('./robustZoneEngine');

// Mock memory manager for testing
class MockMemoryManager {
    constructor() {
        this.isInitialized = true;
    }
    
    normalizeInstrumentName(instrument) {
        return instrument.split(' ')[0].toUpperCase();
    }
    
    getGraduationTable(instrument, direction) {
        // Mock graduation table with realistic feature names
        return {
            features: [
                { name: 'atr_percentage', importance: 0.8 },
                { name: 'rsi_14', importance: 0.7 },
                { name: 'volume_delta', importance: 0.6 },
                { name: 'momentum_5', importance: 0.5 },
                { name: 'body_ratio', importance: 0.4 }
            ]
        };
    }
    
    getVectorsForInstrumentDirection(instrument, direction) {
        // Mock vector data with realistic trade patterns
        const vectors = [];
        
        // Generate 50 profitable trades with varying features
        for (let i = 0; i < 50; i++) {
            const profitable = Math.random() > 0.4; // 60% profitable
            vectors.push({
                featuresJson: JSON.stringify({
                    atr_percentage: 0.02 + Math.random() * 0.03,  // 0.02-0.05 range
                    rsi_14: 45 + Math.random() * 30,             // 45-75 range
                    volume_delta: 500 + Math.random() * 1500,    // 500-2000 range
                    momentum_5: -0.01 + Math.random() * 0.02,    // -0.01 to 0.01
                    body_ratio: 0.3 + Math.random() * 0.4       // 0.3-0.7 range
                }),
                pnlPerContract: profitable ? (5 + Math.random() * 50) : (-30 + Math.random() * 25),
                pnl: profitable ? (5 + Math.random() * 50) : (-30 + Math.random() * 25),
                entryType: Math.random() > 0.5 ? 'EMA_CROSS' : 'MOMENTUM_BREAKOUT'
            });
        }
        
        return vectors;
    }
}

async function testRobustZones() {
    console.log('=== Testing Robust Zone Engine ===\n');
    
    const engine = new RobustZoneEngine();
    const mockMemoryManager = new MockMemoryManager();
    
    // Test query features (from NinjaTrader)
    const queryFeatures = {
        atr_percentage: 0.025,    // In middle of expected range
        rsi_14: 67,               // In upper range
        volume_delta: 1200,       // In middle range
        momentum_5: 0.002,        // Small positive momentum
        body_ratio: 0.5           // Balanced candle
    };
    
    try {
        console.log('Query Features:', queryFeatures);
        console.log('\n--- Running Analysis ---');
        
        const result = await engine.analyze(queryFeatures, 'MGC', 'long', mockMemoryManager);
        
        console.log('\n--- Results ---');
        console.log(`Method: ${result.method}`);
        console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        console.log(`Zone Description: ${result.zone.description}`);
        console.log(`Zone Robustness: ${(result.zone.robustnessScore * 100).toFixed(1)}%`);
        console.log(`Zone Sample Size: ${result.zone.sampleSize}`);
        console.log(`Membership Score: ${(result.membership.score * 100).toFixed(1)}%`);
        console.log(`In Optimal Zone: ${result.membership.inOptimalZone}`);
        console.log(`Processing Time: ${result.processingTime}ms`);
        
        // Test multiple queries to see confidence variation
        console.log('\n--- Testing Multiple Queries ---');
        
        const testCases = [
            { name: 'High ATR (risky)', features: { ...queryFeatures, atr_percentage: 0.08 } },
            { name: 'Low RSI (oversold)', features: { ...queryFeatures, rsi_14: 25 } },
            { name: 'High volume spike', features: { ...queryFeatures, volume_delta: 3000 } },
            { name: 'Optimal conditions', features: { ...queryFeatures, atr_percentage: 0.03, rsi_14: 60 } }
        ];
        
        for (const testCase of testCases) {
            const testResult = await engine.analyze(testCase.features, 'MGC', 'long', mockMemoryManager);
            console.log(`${testCase.name}: ${(testResult.confidence * 100).toFixed(1)}% confidence`);
        }
        
        console.log('\n=== Test Completed Successfully ===');
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run the test
testRobustZones();