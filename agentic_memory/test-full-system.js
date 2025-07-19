/**
 * Full system test for Agentic Memory with PascalCase features
 */

const http = require('http');

// First, verify storage agent has data
function checkStorageStats() {
    return new Promise((resolve, reject) => {
        http.get('http://localhost:3015/api/stats', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const stats = JSON.parse(data);
                    console.log('📊 Storage Stats:', stats);
                    resolve(stats);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// Test various signal configurations
const testSignals = [
    {
        name: "Strong Long - Low RSI, Low BB",
        instrument: "MGC",
        direction: "long",
        entry_price: 3350.5,
        features: {
            Momentum5: 0.003,
            PriceChangePct5: 0.002,
            BbPosition: 0.25,  // Near lower band
            BbWidth: 0.004,
            VolumeSpike3Bar: 1.8,
            EmaSpreadPct: 0.001,
            Rsi: 35,  // Oversold
            AtrPct: 0.002,
            RangeExpansion: 1.2,
            BodyRatio: 0.7,
            UpperWickRatio: 0.1,
            LowerWickRatio: 0.2
        }
    },
    {
        name: "Weak Long - High RSI",
        instrument: "MGC", 
        direction: "long",
        entry_price: 3350.5,
        features: {
            Momentum5: 0.001,
            PriceChangePct5: 0.001,
            BbPosition: 0.5,
            BbWidth: 0.004,
            VolumeSpike3Bar: 1.0,
            EmaSpreadPct: 0.001,
            Rsi: 75,  // Overbought for long = BAD
            AtrPct: 0.002,
            RangeExpansion: 0.8,
            BodyRatio: 0.5,
            UpperWickRatio: 0.3,
            LowerWickRatio: 0.2
        }
    },
    {
        name: "Strong Short - High RSI, High BB",
        instrument: "MGC",
        direction: "short", 
        entry_price: 3350.5,
        features: {
            Momentum5: -0.003,
            PriceChangePct5: -0.002,
            BbPosition: 0.8,  // Near upper band
            BbWidth: 0.004,
            VolumeSpike3Bar: 2.0,
            EmaSpreadPct: -0.001,
            Rsi: 65,  // Overbought for short = GOOD
            AtrPct: 0.002,
            RangeExpansion: 1.5,
            BodyRatio: 0.7,
            UpperWickRatio: 0.2,
            LowerWickRatio: 0.1
        }
    },
    {
        name: "Neutral Signal",
        instrument: "MGC",
        direction: "long",
        entry_price: 3350.5,
        features: {
            Momentum5: 0,
            PriceChangePct5: 0,
            BbPosition: 0.5,
            BbWidth: 0.003,
            VolumeSpike3Bar: 1.0,
            EmaSpreadPct: 0,
            Rsi: 50,
            AtrPct: 0.0015,
            RangeExpansion: 1.0,
            BodyRatio: 0.5,
            UpperWickRatio: 0.25,
            LowerWickRatio: 0.25
        }
    }
];

// Test risk approval for each signal
function testSignalApproval(signal) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            ...signal,
            timestamp: new Date().toISOString()
        });
        
        const options = {
            hostname: 'localhost',
            port: 3017,
            path: '/api/approve-signal',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    console.log(`\n📋 ${signal.name}:`);
                    console.log(`  Direction: ${signal.direction}`);
                    console.log(`  RSI: ${signal.features.Rsi}, BB Position: ${signal.features.BbPosition}`);
                    console.log(`  ✅ Approved: ${response.approved}`);
                    console.log(`  📊 Confidence: ${response.confidence.toFixed(3)}`);
                    console.log(`  📝 Method: ${response.method}`);
                    console.log(`  💡 Reasoning: ${response.reasoning}`);
                    if (response.patternsUsed) {
                        console.log(`  🔍 Patterns Used: ${response.patternsUsed}`);
                    }
                    resolve(response);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// Run all tests
async function runTests() {
    console.log('🚀 Running Full System Test\n');
    
    try {
        // Check storage stats
        const stats = await checkStorageStats();
        console.log(`\n✅ Storage Agent: ${stats.totalVectors} vectors available\n`);
        
        // Test each signal
        console.log('🧪 Testing Signal Approvals:');
        for (const signal of testSignals) {
            await testSignalApproval(signal);
            // Small delay between tests
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        console.log('\n✅ All tests completed!');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
    }
}

// Run tests
runTests();