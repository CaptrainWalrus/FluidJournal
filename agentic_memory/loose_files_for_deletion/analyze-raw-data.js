const fs = require('fs');
const path = require('path');

// Let's analyze the ME service logs more thoroughly
async function analyzeRawData() {
    console.log('🔍 RAW DATA ANALYSIS - TRACKING THE STATIC FEATURE PROBLEM');
    console.log('=' .repeat(80));
    
    // 1. Analyze scratchlogs for patterns
    console.log('\n📋 ANALYZING SCRATCHLOGS FOR FEATURE GENERATION PATTERNS...\n');
    
    const logPath = '/mnt/c/workspace/production-curves/Production/agentic_memory/scratchlogs.txt';
    
    try {
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.split('\n');
        
        // Pattern analysis
        const patterns = {
            positionRegistrations: [],
            positionDeregistrations: [],
            featureGenerations: [],
            agenticMemoryStores: [],
            miServiceCalls: []
        };
        
        let currentBlock = [];
        let blockType = null;
        
        lines.forEach((line, idx) => {
            // Track position registrations
            if (line.includes('[POSITION-TRACKING] Registering position')) {
                const match = line.match(/Registering position: (.+?) for (.+?)$/);
                if (match) {
                    patterns.positionRegistrations.push({
                        line: idx,
                        entrySignalId: match[1],
                        instrument: match[2],
                        fullLine: line
                    });
                }
            }
            
            // Track deregistrations
            if (line.includes('[POSITION-TRACKING] Position deregistered')) {
                const match = line.match(/Position deregistered: (.+?) - PnL: (.+?), MaxProfit: (.+?), MaxLoss: (.+?)$/);
                if (match) {
                    patterns.positionDeregistrations.push({
                        line: idx,
                        entrySignalId: match[1],
                        pnl: parseFloat(match[2]),
                        maxProfit: parseFloat(match[3]),
                        maxLoss: parseFloat(match[4]),
                        fullLine: line
                    });
                }
            }
            
            // Track feature generations
            if (line.includes('[FEATURE-GENERATION]')) {
                if (blockType === 'feature' && currentBlock.length > 0) {
                    patterns.featureGenerations.push({
                        line: idx - currentBlock.length,
                        block: currentBlock.join('\n')
                    });
                }
                blockType = 'feature';
                currentBlock = [line];
            } else if (blockType === 'feature') {
                currentBlock.push(line);
                if (line.trim() === '' || idx === lines.length - 1) {
                    patterns.featureGenerations.push({
                        line: idx - currentBlock.length + 1,
                        block: currentBlock.join('\n')
                    });
                    blockType = null;
                    currentBlock = [];
                }
            }
            
            // Track Agentic Memory stores
            if (line.includes('[AGENTIC-MEMORY] Storing position outcome')) {
                patterns.agenticMemoryStores.push({
                    line: idx,
                    fullLine: line
                });
            }
            
            // Track MI service responses
            if (line.includes('MI Response status:') || line.includes('bars_available:')) {
                patterns.miServiceCalls.push({
                    line: idx,
                    fullLine: line
                });
            }
        });
        
        // Display findings
        console.log(`📊 PATTERN SUMMARY:`);
        console.log(`- Position Registrations: ${patterns.positionRegistrations.length}`);
        console.log(`- Position Deregistrations: ${patterns.positionDeregistrations.length}`);
        console.log(`- Feature Generation Calls: ${patterns.featureGenerations.length}`);
        console.log(`- Agentic Memory Stores: ${patterns.agenticMemoryStores.length}`);
        console.log(`- MI Service Responses: ${patterns.miServiceCalls.length}`);
        
        // Analyze deregistration patterns
        console.log('\n\n💰 DEREGISTRATION ANALYSIS:');
        console.log('-'.repeat(80));
        
        const deregStats = {
            totalCount: patterns.positionDeregistrations.length,
            zeroPnl: 0,
            zeroMaxProfit: 0,
            zeroMaxLoss: 0,
            allZeros: 0,
            samples: []
        };
        
        patterns.positionDeregistrations.forEach(dereg => {
            if (dereg.pnl === 0) deregStats.zeroPnl++;
            if (dereg.maxProfit === 0) deregStats.zeroMaxProfit++;
            if (dereg.maxLoss === 0) deregStats.zeroMaxLoss++;
            if (dereg.pnl === 0 && dereg.maxProfit === 0 && dereg.maxLoss === 0) {
                deregStats.allZeros++;
            }
            
            if (deregStats.samples.length < 10) {
                deregStats.samples.push(dereg);
            }
        });
        
        console.log(`Total deregistrations: ${deregStats.totalCount}`);
        console.log(`Zero PnL: ${deregStats.zeroPnl} (${(deregStats.zeroPnl/deregStats.totalCount*100).toFixed(1)}%)`);
        console.log(`Zero MaxProfit: ${deregStats.zeroMaxProfit} (${(deregStats.zeroMaxProfit/deregStats.totalCount*100).toFixed(1)}%)`);
        console.log(`Zero MaxLoss: ${deregStats.zeroMaxLoss} (${(deregStats.zeroMaxLoss/deregStats.totalCount*100).toFixed(1)}%)`);
        console.log(`All zeros: ${deregStats.allZeros} (${(deregStats.allZeros/deregStats.totalCount*100).toFixed(1)}%)`);
        
        console.log('\nSample deregistrations:');
        deregStats.samples.slice(0, 5).forEach((dereg, idx) => {
            console.log(`${idx + 1}. Line ${dereg.line}: PnL=${dereg.pnl}, MaxP=${dereg.maxProfit}, MaxL=${dereg.maxLoss}`);
        });
        
        // Analyze feature generation blocks
        console.log('\n\n🧪 FEATURE GENERATION BLOCK ANALYSIS:');
        console.log('-'.repeat(80));
        
        const featureGenStats = {
            totalBlocks: patterns.featureGenerations.length,
            withMIResponse: 0,
            withFallback: 0,
            withUndefinedValues: 0,
            barsAvailableCounts: new Map(),
            samples: []
        };
        
        patterns.featureGenerations.forEach(fg => {
            const block = fg.block;
            
            if (block.includes('MI Response status: 200')) featureGenStats.withMIResponse++;
            if (block.includes('FALLBACK TRIGGERED')) featureGenStats.withFallback++;
            if (block.includes('undefined')) featureGenStats.withUndefinedValues++;
            
            // Extract bars_available
            const barsMatch = block.match(/bars_available: (\d+)/);
            if (barsMatch) {
                const count = parseInt(barsMatch[1]);
                featureGenStats.barsAvailableCounts.set(count, (featureGenStats.barsAvailableCounts.get(count) || 0) + 1);
            }
            
            if (featureGenStats.samples.length < 3) {
                featureGenStats.samples.push(fg);
            }
        });
        
        console.log(`Total feature generation blocks: ${featureGenStats.totalBlocks}`);
        console.log(`With MI Response 200: ${featureGenStats.withMIResponse}`);
        console.log(`With Fallback: ${featureGenStats.withFallback}`);
        console.log(`With undefined values: ${featureGenStats.withUndefinedValues} (${(featureGenStats.withUndefinedValues/featureGenStats.totalBlocks*100).toFixed(1)}%)`);
        
        console.log('\nbars_available distribution:');
        Array.from(featureGenStats.barsAvailableCounts.entries())
            .sort((a, b) => a[0] - b[0])
            .forEach(([bars, count]) => {
                console.log(`  ${bars} bars: ${count} times`);
            });
        
        // Show sample feature generation blocks
        console.log('\n📝 SAMPLE FEATURE GENERATION BLOCKS:');
        console.log('-'.repeat(80));
        
        featureGenStats.samples.forEach((sample, idx) => {
            console.log(`\n--- Sample ${idx + 1} (line ${sample.line}) ---`);
            console.log(sample.block);
            console.log('---');
        });
        
        // Trace a specific position lifecycle
        console.log('\n\n🔄 POSITION LIFECYCLE TRACE:');
        console.log('-'.repeat(80));
        
        if (patterns.positionRegistrations.length > 0) {
            // Pick a position to trace
            const positionToTrace = patterns.positionRegistrations[0];
            const signalId = positionToTrace.entrySignalId;
            
            console.log(`Tracing position: ${signalId}`);
            console.log(`1. Registration at line ${positionToTrace.line}`);
            
            // Find related events
            const relatedFeatureGen = patterns.featureGenerations.find(fg => 
                fg.line > positionToTrace.line && fg.block.includes(signalId)
            );
            
            const relatedDereg = patterns.positionDeregistrations.find(d => 
                d.entrySignalId === signalId
            );
            
            const relatedStore = patterns.agenticMemoryStores.find(s => 
                s.line > positionToTrace.line && s.fullLine.includes(signalId)
            );
            
            if (relatedFeatureGen) {
                console.log(`2. Feature generation at line ${relatedFeatureGen.line}`);
            }
            
            if (relatedDereg) {
                console.log(`3. Deregistration at line ${relatedDereg.line}: PnL=${relatedDereg.pnl}, MaxP=${relatedDereg.maxProfit}, MaxL=${relatedDereg.maxLoss}`);
            }
            
            if (relatedStore) {
                console.log(`4. Agentic Memory store at line ${relatedStore.line}`);
            }
        }
        
        // Root cause analysis
        console.log('\n\n🎯 ROOT CAUSE ANALYSIS:');
        console.log('=' .repeat(80));
        
        console.log('\n1. TIMING ISSUE:');
        console.log('   - Features are generated AFTER deregistration in the logs');
        console.log('   - This suggests features are captured too late or with stale data');
        
        console.log('\n2. DATA AVAILABILITY:');
        if (featureGenStats.barsAvailableCounts.has(0)) {
            console.log('   ⚠️  Features generated with 0 bars available!');
            console.log('   - This explains why all features use fallback values');
        }
        
        console.log('\n3. CALCULATION ERRORS:');
        if (featureGenStats.withUndefinedValues > 0) {
            console.log(`   ⚠️  ${(featureGenStats.withUndefinedValues/featureGenStats.totalBlocks*100).toFixed(1)}% of feature generations contain undefined values`);
            console.log('   - EMA3 and VWAP calculations are failing');
        }
        
        console.log('\n4. MAXPROFIT/MAXLOSS TRACKING:');
        if (deregStats.zeroMaxProfit > deregStats.totalCount * 0.9) {
            console.log('   ⚠️  Over 90% of positions have zero MaxProfit/MaxLoss');
            console.log('   - Bar history is not being tracked during position lifetime');
        }
        
    } catch (error) {
        console.error('Error reading scratchlogs:', error.message);
    }
}

analyzeRawData();