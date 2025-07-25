/**
 * Inspect real data structure in the database
 */

const vectorStore = require('./src/vectorStore');

async function inspectRealData() {
  console.log('🔍 Inspecting Real Data Structure\n');

  try {
    // Initialize vector store
    await vectorStore.initialize();
    
    // Get a few real vectors
    const realVectors = await vectorStore.getVectors({ limit: 3 });
    
    console.log(`📊 Found ${realVectors.length} vectors. Inspecting structure:\n`);
    
    realVectors.forEach((vector, index) => {
      console.log(`Vector ${index + 1}:`);
      console.log('  ID:', vector.id);
      console.log('  Entry Signal ID:', vector.entrySignalId);
      console.log('  Entry Type:', vector.entryType);
      console.log('  Instrument:', vector.instrument);
      console.log('  Direction:', vector.direction);
      console.log('  Timestamp:', new Date(vector.timestamp).toISOString());
      console.log('  Features:', vector.features ? `Array[${vector.features.length}]` : 'null');
      console.log('  Risk Used:');
      console.log('    - Stop Loss:', vector.stopLoss);
      console.log('    - Take Profit:', vector.takeProfit);
      console.log('    - Virtual Stop:', vector.virtualStop);
      console.log('  Outcome:');
      console.log('    - PnL:', vector.pnl);
      console.log('    - PnL Points:', vector.pnlPoints);
      console.log('    - Holding Bars:', vector.holdingBars);
      console.log('    - Exit Reason:', vector.exitReason);
      console.log('    - Max Profit:', vector.maxProfit);
      console.log('    - Max Loss:', vector.maxLoss);
      console.log('    - Was Good Exit:', vector.wasGoodExit);
      console.log('');
    });

    await vectorStore.close();
    
  } catch (error) {
    console.error('❌ Inspection failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Run inspection
inspectRealData();