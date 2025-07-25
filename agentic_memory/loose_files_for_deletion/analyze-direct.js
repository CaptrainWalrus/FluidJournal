const lancedb = require('vectordb');

async function analyzeLanceDBDirect() {
  try {
    console.log('🔍 DIRECT LANCEDB ANALYSIS...');
    console.log('═'.repeat(60));
    
    // Connect directly to the data path where transaction files exist
    const dbPath = './data/vectors';
    console.log(`📂 Connecting to: ${dbPath}`);
    
    const db = await lancedb.connect(dbPath);
    
    // List tables
    const tables = await db.tableNames();
    console.log(`📊 Available tables: ${tables.join(', ')}`);
    
    if (tables.length === 0) {
      console.log('❌ No tables found in database');
      return;
    }
    
    // Open the feature_vectors table
    const tableName = 'feature_vectors';
    if (!tables.includes(tableName)) {
      console.log(`❌ Table '${tableName}' not found`);
      return;
    }
    
    const table = await db.openTable(tableName);
    console.log(`✅ Opened table: ${tableName}`);
    
    // Get total count first
    const allRecords = await table.filter('id IS NOT NULL').limit(100000).execute();
    console.log(`📈 Total records found: ${allRecords.length}`);
    
    if (allRecords.length === 0) {
      console.log('📝 Table is empty');
      return;
    }
    
    console.log('\n🔬 FIRST 3 SAMPLE RECORDS:');
    console.log('─'.repeat(60));
    
    allRecords.slice(0, 3).forEach((record, idx) => {
      console.log(`\nRecord ${idx + 1} (${record.id}):`);
      console.log(`  entrySignalId: ${record.entrySignalId}`);
      console.log(`  recordType: ${record.recordType}`);
      console.log(`  status: ${record.status}`);
      console.log(`  instrument: ${record.instrument}`);
      console.log(`  entryType: ${record.entryType}`);
      console.log(`  direction: ${record.direction}`);
      console.log(`  pnl: ${record.pnl}`);
      console.log(`  exitReason: ${record.exitReason}`);
      console.log(`  featuresJson length: ${record.featuresJson?.length || 0}`);
      console.log(`  timestamp: ${record.timestamp}`);
      console.log(`  Available fields: ${Object.keys(record).slice(0, 15).join(', ')}...`);
    });
    
    // Full analysis
    let withRecordType = 0;
    let withoutRecordType = 0;
    let withStatus = 0;
    let withoutStatus = 0;
    let withPnl = 0;
    let withoutPnl = 0;
    let withFeatures = 0;
    let withoutFeatures = 0;
    
    const recordTypeBreakdown = {};
    const statusBreakdown = {};
    const pnlValues = [];
    const problemRecords = [];
    
    console.log('\n🔍 ANALYZING ALL RECORDS...');
    console.log('─'.repeat(60));
    
    allRecords.forEach((record, index) => {
      // Record type analysis
      if (record.recordType !== undefined && record.recordType !== null) {
        withRecordType++;
        recordTypeBreakdown[record.recordType] = (recordTypeBreakdown[record.recordType] || 0) + 1;
      } else {
        withoutRecordType++;
        recordTypeBreakdown['undefined'] = (recordTypeBreakdown['undefined'] || 0) + 1;
      }
      
      // Status analysis
      if (record.status !== undefined && record.status !== null) {
        withStatus++;
        statusBreakdown[record.status] = (statusBreakdown[record.status] || 0) + 1;
      } else {
        withoutStatus++;
        statusBreakdown['undefined'] = (statusBreakdown['undefined'] || 0) + 1;
      }
      
      // PnL analysis
      if (record.pnl !== undefined && record.pnl !== null && record.pnl !== 0) {
        withPnl++;
        pnlValues.push(record.pnl);
      } else {
        withoutPnl++;
      }
      
      // Features analysis
      if (record.featuresJson && record.featuresJson !== '{}') {
        withFeatures++;
      } else {
        withoutFeatures++;
      }
      
      // Identify problem records (pnl data but missing metadata)
      if ((record.pnl !== undefined && record.pnl !== null && record.pnl !== 0) && 
          (record.recordType === undefined || record.status === undefined)) {
        problemRecords.push({
          id: record.id,
          entrySignalId: record.entrySignalId,
          recordType: record.recordType,
          status: record.status,
          pnl: record.pnl,
          timestamp: record.timestamp,
          instrument: record.instrument,
          entryType: record.entryType
        });
      }
    });
    
    console.log('\n📈 RECORD TYPE ANALYSIS:');
    console.log('─'.repeat(50));
    console.log(`✅ With recordType: ${withRecordType}`);
    console.log(`❌ Without recordType: ${withoutRecordType}`);
    console.log('\nRecord Type Breakdown:');
    Object.entries(recordTypeBreakdown).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });
    
    console.log('\n📊 STATUS ANALYSIS:');
    console.log('─'.repeat(50));
    console.log(`✅ With status: ${withStatus}`);
    console.log(`❌ Without status: ${withoutStatus}`);
    console.log('\nStatus Breakdown:');
    Object.entries(statusBreakdown).forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`);
    });
    
    console.log('\n💰 PNL DATA ANALYSIS:');
    console.log('─'.repeat(50));
    console.log(`✅ With PnL data: ${withPnl}`);
    console.log(`❌ Without PnL data (0 or null): ${withoutPnl}`);
    if (pnlValues.length > 0) {
      const avgPnl = pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length;
      const minPnl = Math.min(...pnlValues);
      const maxPnl = Math.max(...pnlValues);
      console.log(`💵 PnL Range: $${minPnl.toFixed(2)} to $${maxPnl.toFixed(2)}`);
      console.log(`📊 Average PnL: $${avgPnl.toFixed(2)}`);
    }
    
    console.log('\n🔧 FEATURES ANALYSIS:');
    console.log('─'.repeat(50));
    console.log(`✅ With features: ${withFeatures}`);
    console.log(`❌ Without features: ${withoutFeatures}`);
    
    console.log('\n🚨 PROBLEM RECORDS ANALYSIS:');
    console.log('─'.repeat(50));
    console.log(`🔴 Records with PnL but missing metadata: ${problemRecords.length}`);
    
    if (problemRecords.length > 0) {
      console.log('\nFirst 10 problem records:');
      problemRecords.slice(0, 10).forEach((record, idx) => {
        console.log(`   ${idx + 1}. ${record.entrySignalId} | recordType: ${record.recordType} | status: ${record.status} | PnL: $${record.pnl?.toFixed(2)} | ${record.instrument} | ${record.entryType}`);
      });
      
      if (problemRecords.length > 10) {
        console.log(`   ... and ${problemRecords.length - 10} more`);
      }
    }
    
    console.log('\n📋 SUMMARY:');
    console.log('═'.repeat(50));
    const completeRecords = allRecords.filter(v => 
      v.recordType !== undefined && 
      v.status !== undefined && 
      (v.pnl !== undefined || v.featuresJson !== '{}')
    ).length;
    
    console.log(`📊 Total Records: ${allRecords.length}`);
    console.log(`✅ Complete Records: ${completeRecords}`);
    console.log(`❌ Incomplete Records: ${allRecords.length - completeRecords}`);
    console.log(`🔴 Problem Records (PnL + missing metadata): ${problemRecords.length}`);
    
    // Check duplicate entry signals
    console.log('\n🔍 DUPLICATE ANALYSIS:');
    console.log('─'.repeat(50));
    
    const duplicateEntrySignals = {};
    allRecords.forEach(record => {
      if (record.entrySignalId) {
        duplicateEntrySignals[record.entrySignalId] = (duplicateEntrySignals[record.entrySignalId] || 0) + 1;
      }
    });
    
    const duplicates = Object.entries(duplicateEntrySignals).filter(([id, count]) => count > 1);
    console.log(`🔄 Duplicate entrySignalIds: ${duplicates.length}`);
    if (duplicates.length > 0 && duplicates.length <= 10) {
      duplicates.forEach(([id, count]) => {
        console.log(`   ${id}: ${count} records`);
      });
    } else if (duplicates.length > 10) {
      console.log('   (Showing first 10 duplicates)');
      duplicates.slice(0, 10).forEach(([id, count]) => {
        console.log(`   ${id}: ${count} records`);
      });
    }
    
  } catch (error) {
    console.error('❌ Analysis failed:', error);
  }
}

analyzeLanceDBDirect();