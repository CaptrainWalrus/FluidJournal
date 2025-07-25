const lancedb = require('vectordb');
const fs = require('fs').promises;
const path = require('path');

async function compactLanceDB() {
    const dbPath = './data/vectors';
    const tableName = 'feature_vectors';
    
    console.log('🗜️  Starting LanceDB compaction...');
    console.log(`Database path: ${dbPath}`);
    
    try {
        // Get initial size
        const initialStats = await getDirSize(path.join(dbPath, tableName + '.lance'));
        console.log(`📊 Initial database size: ${formatBytes(initialStats)}`);
        
        // Connect to database
        const db = await lancedb.connect(dbPath);
        const table = await db.openTable(tableName);
        
        // Get record count before compaction
        const recordCount = await table.countRows();
        console.log(`📦 Total records: ${recordCount.toLocaleString()}`);
        
        // Perform compaction
        console.log('🔄 Compacting database...');
        await table.compactFiles();
        console.log('✅ Compaction completed');
        
        // Get final size
        const finalStats = await getDirSize(path.join(dbPath, tableName + '.lance'));
        console.log(`📊 Final database size: ${formatBytes(finalStats)}`);
        
        const savings = initialStats - finalStats;
        const percentage = ((savings / initialStats) * 100).toFixed(1);
        
        console.log(`💾 Space saved: ${formatBytes(savings)} (${percentage}%)`);
        console.log(`🎯 Compression ratio: ${(initialStats / finalStats).toFixed(1)}:1`);
        
    } catch (error) {
        console.error('❌ Compaction failed:', error);
        process.exit(1);
    }
}

async function getDirSize(dirPath) {
    let totalSize = 0;
    
    try {
        const items = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const item of items) {
            const itemPath = path.join(dirPath, item.name);
            
            if (item.isDirectory()) {
                totalSize += await getDirSize(itemPath);
            } else {
                const stats = await fs.stat(itemPath);
                totalSize += stats.size;
            }
        }
    } catch (error) {
        console.warn(`Warning: Could not read ${dirPath}:`, error.message);
    }
    
    return totalSize;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Run compaction
compactLanceDB();