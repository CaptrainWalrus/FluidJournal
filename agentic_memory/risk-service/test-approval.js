/**
 * Test the risk service approval endpoint with NinjaTrader-style features
 */

const http = require('http');

// Test data with PascalCase features (as sent by NinjaTrader)
const testSignal = {
    instrument: "MGC",
    direction: "long",
    entry_price: 3350.5,
    timestamp: new Date().toISOString(),
    features: {
        // NinjaTrader sends PascalCase
        Momentum5: 0.003,
        PriceChangePct5: 0.002,
        BbPosition: 0.25,
        BbWidth: 0.004,
        VolumeSpike3Bar: 1.8,
        EmaSpreadPct: 0.001,
        Rsi: 35,
        AtrPct: 0.002,
        RangeExpansion: 1.2,
        BodyRatio: 0.7,
        UpperWickRatio: 0.1,
        LowerWickRatio: 0.2
    }
};

function testApproval() {
    const postData = JSON.stringify(testSignal);
    
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
        
        res.on('data', (chunk) => {
            data += chunk;
        });
        
        res.on('end', () => {
            console.log('Response:', JSON.parse(data));
        });
    });

    req.on('error', (error) => {
        console.error('Error:', error);
    });

    req.write(postData);
    req.end();
}

console.log('Testing signal approval with PascalCase features:');
console.log(JSON.stringify(testSignal, null, 2));
console.log('\nSending request...\n');

testApproval();