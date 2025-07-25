/**
 * Test the /api/evaluate-risk endpoint with robust zones
 */

const axios = require('axios');

async function testRobustZonesEndpoint() {
    const testPayload = {
        features: {
            atr_percentage: 0.025,
            rsi_14: 67,
            volume_delta: 1200,
            momentum_5: 0.002,
            body_ratio: 0.5,
            close_price: 2750.5
        },
        instrument: "MGC",
        direction: "long",
        entryType: "EMA_CROSS",
        timestamp: Date.now(),
        entrySignalId: "test_123",
        quantity: 1
    };
    
    try {
        console.log('Testing robust zones endpoint...');
        console.log('Payload:', JSON.stringify(testPayload, null, 2));
        
        const response = await axios.post('http://localhost:3017/api/evaluate-risk', testPayload);
        
        console.log('\n--- Response ---');
        console.log(`Status: ${response.status}`);
        console.log(`Method: ${response.data.method}`);
        console.log(`Confidence: ${(response.data.confidence * 100).toFixed(1)}%`);
        console.log(`Approved: ${response.data.approved}`);
        console.log(`Reasoning: ${response.data.reasoning}`);
        console.log(`Stop Loss: ${response.data.suggested_sl}`);
        console.log(`Take Profit: ${response.data.suggested_tp}`);
        
        if (response.data.robustZonesDetails) {
            console.log('\n--- Robust Zones Details ---');
            console.log(`Zone Membership: ${(response.data.robustZonesDetails.zoneMembership * 100).toFixed(1)}%`);
            console.log(`Zone Robustness: ${(response.data.robustZonesDetails.zoneRobustness * 100).toFixed(1)}%`);
            console.log(`Sample Size: ${response.data.robustZonesDetails.sampleSize}`);
            console.log(`In Optimal Zone: ${response.data.robustZonesDetails.inOptimalZone}`);
        }
        
        console.log('\n=== Endpoint Test Successful ===');
        
    } catch (error) {
        if (error.response) {
            console.error('Response Error:', error.response.status, error.response.data);
        } else {
            console.error('Request Error:', error.message);
        }
    }
}

testRobustZonesEndpoint();