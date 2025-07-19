const fs = require('fs');
const path = require('path');

console.log('🔍 FEATURE GENERATION TRACE ANALYSIS');
console.log('=' .repeat(80));

// Function to extract feature generation logs
function analyzeFeatureGenerationLogs() {
    const logPaths = [
        '/mnt/c/workspace/production-curves/Production/matching-engine-service/logs/me-service.log',
        '/mnt/c/workspace/production-curves/Production/agentic_memory/scratchlogs.txt'
    ];
    
    console.log('\n📋 Searching for feature generation patterns in logs...\n');
    
    const patterns = {
        featureGenStart: /\[FEATURE-GENERATION\]/g,
        miResponse: /MI Response status:|MI Response data keys:|bars\.length/g,
        fallbackTrigger: /FALLBACK TRIGGERED/g,
        sampleFeatures: /Sample features:/g,
        barsAvailable: /bars_available: (\d+)/g,
        generatedCount: /Generated (\d+) features/g,
        ema3Value: /EMA3=([^,\s]+)/g,
        vwapValue: /VWAP=([^,\s]+)/g,
        rsiValue: /RSI=([^,\s]+)/g
    };
    
    const findings = {
        totalFeatureGenCalls: 0,
        fallbackCount: 0,
        barsAvailableValues: new Set(),
        ema3Values: new Set(),
        vwapValues: new Set(),
        rsiValues: new Set(),
        featureCountValues: new Set(),
        sampleLogs: []
    };
    
    logPaths.forEach(logPath => {
        try {
            if (fs.existsSync(logPath)) {
                console.log(`📖 Reading log: ${logPath}`);
                const content = fs.readFileSync(logPath, 'utf8');
                const lines = content.split('\n');
                
                let currentFeatureGenBlock = [];
                let inFeatureGenBlock = false;
                
                lines.forEach((line, idx) => {
                    // Track feature generation blocks
                    if (line.includes('[FEATURE-GENERATION]')) {
                        if (inFeatureGenBlock && currentFeatureGenBlock.length > 0) {
                            findings.sampleLogs.push(currentFeatureGenBlock.join('\n'));
                        }
                        inFeatureGenBlock = true;
                        currentFeatureGenBlock = [line];
                        findings.totalFeatureGenCalls++;
                    } else if (inFeatureGenBlock) {
                        currentFeatureGenBlock.push(line);
                        
                        // End block on empty line or new section
                        if (line.trim() === '' || line.includes('[') && !line.includes('[FEATURE-GENERATION]')) {
                            if (currentFeatureGenBlock.length > 1) {
                                findings.sampleLogs.push(currentFeatureGenBlock.join('\n'));
                            }
                            inFeatureGenBlock = false;
                            currentFeatureGenBlock = [];
                        }
                    }
                    
                    // Extract specific values
                    if (line.includes('FALLBACK TRIGGERED')) {
                        findings.fallbackCount++;
                    }
                    
                    const barsMatch = line.match(/bars_available: (\d+)/);
                    if (barsMatch) {
                        findings.barsAvailableValues.add(parseInt(barsMatch[1]));
                    }
                    
                    const featureCountMatch = line.match(/Generated (\d+) features/);
                    if (featureCountMatch) {
                        findings.featureCountValues.add(parseInt(featureCountMatch[1]));
                    }
                    
                    const ema3Match = line.match(/EMA3=([^,\s]+)/);
                    if (ema3Match) {
                        findings.ema3Values.add(ema3Match[1]);
                    }
                    
                    const vwapMatch = line.match(/VWAP=([^,\s]+)/);
                    if (vwapMatch) {
                        findings.vwapValues.add(vwapMatch[1]);
                    }
                    
                    const rsiMatch = line.match(/RSI=([^,\s]+)/);
                    if (rsiMatch) {
                        findings.rsiValues.add(rsiMatch[1]);
                    }
                });
                
                console.log(`   ✅ Processed ${lines.length} lines\n`);
            } else {
                console.log(`   ⚠️  Log file not found: ${logPath}\n`);
            }
        } catch (error) {
            console.log(`   ❌ Error reading log ${logPath}: ${error.message}\n`);
        }
    });
    
    // Display findings
    console.log('📊 ANALYSIS RESULTS:');
    console.log('-'.repeat(80));
    console.log(`Total feature generation calls: ${findings.totalFeatureGenCalls}`);
    console.log(`Fallback triggered count: ${findings.fallbackCount} (${(findings.fallbackCount / findings.totalFeatureGenCalls * 100).toFixed(1)}%)`);
    console.log(`\nbars_available values seen: ${Array.from(findings.barsAvailableValues).sort((a,b) => a-b).join(', ')}`);
    console.log(`Feature count values: ${Array.from(findings.featureCountValues).join(', ')}`);
    console.log(`\nEMA3 values: ${Array.from(findings.ema3Values).slice(0, 10).join(', ')}${findings.ema3Values.size > 10 ? '...' : ''}`);
    console.log(`VWAP values: ${Array.from(findings.vwapValues).slice(0, 10).join(', ')}${findings.vwapValues.size > 10 ? '...' : ''}`);
    console.log(`RSI values: ${Array.from(findings.rsiValues).slice(0, 10).join(', ')}${findings.rsiValues.size > 10 ? '...' : ''}`);
    
    // Show sample logs
    console.log('\n📝 SAMPLE FEATURE GENERATION BLOCKS:');
    console.log('-'.repeat(80));
    
    findings.sampleLogs.slice(0, 3).forEach((log, idx) => {
        console.log(`\n--- Sample ${idx + 1} ---`);
        console.log(log);
    });
    
    // Analyze the pattern
    console.log('\n🔬 PATTERN ANALYSIS:');
    console.log('-'.repeat(80));
    
    if (findings.barsAvailableValues.has(0)) {
        console.log('⚠️  WARNING: Feature generation called with 0 bars available!');
        console.log('   This explains why features are using fallback values.');
    }
    
    if (findings.ema3Values.has('undefined')) {
        console.log('⚠️  WARNING: EMA3 returning undefined!');
        console.log('   This indicates the calculation function is not working properly.');
    }
    
    if (findings.fallbackCount > findings.totalFeatureGenCalls * 0.1) {
        console.log('⚠️  WARNING: More than 10% of feature generations are using fallback!');
        console.log('   This suggests MI service connection issues.');
    }
    
    return findings;
}

// Function to check MI service bar buffer
async function checkMIServiceBarBuffer() {
    console.log('\n\n🔍 CHECKING MI SERVICE BAR BUFFER:');
    console.log('-'.repeat(80));
    
    const axios = require('axios');
    
    try {
        const miResponse = await axios.get('http://localhost:3002/api/bars/MGC', {
            timeout: 5000
        });
        
        if (miResponse.data && miResponse.data.success) {
            const bars = miResponse.data.bars || [];
            console.log(`✅ MI Service returned ${bars.length} bars`);
            
            if (bars.length > 0) {
                // Check variation in bar data
                const closes = bars.map(b => b.close);
                const uniqueCloses = new Set(closes);
                
                console.log(`   Unique close prices: ${uniqueCloses.size}`);
                console.log(`   Close price range: ${Math.min(...closes)} - ${Math.max(...closes)}`);
                console.log(`   First 5 closes: ${closes.slice(0, 5).join(', ')}`);
                console.log(`   Last 5 closes: ${closes.slice(-5).join(', ')}`);
                
                // Check if bars have proper timestamps
                const timestamps = bars.map(b => b.timestamp);
                const firstTime = new Date(timestamps[0]);
                const lastTime = new Date(timestamps[timestamps.length - 1]);
                console.log(`   Time range: ${firstTime.toISOString()} to ${lastTime.toISOString()}`);
                console.log(`   Time span: ${((lastTime - firstTime) / (1000 * 60)).toFixed(1)} minutes`);
            }
        } else {
            console.log('❌ MI Service returned no data or success=false');
        }
    } catch (error) {
        console.log(`❌ Failed to connect to MI Service: ${error.message}`);
        console.log('   This could explain why features are using fallback values!');
    }
}

// Function to test feature calculation directly
function testFeatureCalculations() {
    console.log('\n\n🧪 TESTING FEATURE CALCULATIONS:');
    console.log('-'.repeat(80));
    
    // Create sample bar data
    const sampleBars = [
        { open: 3380, high: 3385, low: 3378, close: 3382, volume: 100 },
        { open: 3382, high: 3388, low: 3380, close: 3386, volume: 120 },
        { open: 3386, high: 3390, low: 3384, close: 3389, volume: 150 },
        { open: 3389, high: 3392, low: 3387, close: 3388, volume: 130 },
        { open: 3388, high: 3391, low: 3385, close: 3387, volume: 110 }
    ];
    
    console.log('Sample bars:');
    sampleBars.forEach((bar, idx) => {
        console.log(`  Bar ${idx}: close=${bar.close}, volume=${bar.volume}`);
    });
    
    // Test consecutive bars counting
    function testConsecutiveBars(bars) {
        let upCount = 0;
        let downCount = 0;
        
        for (let i = bars.length - 1; i > 0; i--) {
            if (bars[i].close > bars[i-1].close) {
                if (downCount > 0) break;
                upCount++;
            } else if (bars[i].close < bars[i-1].close) {
                if (upCount > 0) break;
                downCount++;
            } else {
                break;
            }
        }
        
        return { up: upCount, down: downCount };
    }
    
    const consecutiveResult = testConsecutiveBars(sampleBars);
    console.log(`\nConsecutive bars test: up=${consecutiveResult.up}, down=${consecutiveResult.down}`);
    console.log('Expected: Should show actual consecutive count, not just 0 or 1');
    
    // Test price variations
    const priceVariations = sampleBars.map((bar, idx) => {
        if (idx === 0) return 0;
        return ((bar.close - sampleBars[idx-1].close) / sampleBars[idx-1].close * 100).toFixed(2);
    });
    
    console.log(`\nPrice variations: ${priceVariations.join('%, ')}%`);
    console.log('These should NOT all be the same in real data!');
}

// Run all analyses
async function runFullDiagnosis() {
    analyzeFeatureGenerationLogs();
    await checkMIServiceBarBuffer();
    testFeatureCalculations();
    
    console.log('\n\n🎯 CONCLUSIONS:');
    console.log('=' .repeat(80));
    console.log('1. If bars_available is 0, features will use static fallback values');
    console.log('2. If EMA3/VWAP show "undefined", the calculation functions need debugging');
    console.log('3. If MI service is unreachable, all features will be identical');
    console.log('4. The issue is likely in the data flow, not the calculations themselves');
}

runFullDiagnosis().catch(console.error);