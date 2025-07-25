const lancedb = require('vectordb');
const fs = require('fs').promises;
const path = require('path');

async function rebuildDatabase() {
    const dbPath = './data/vectors';
    const tableName = 'feature_vectors';
    const backupTableName = 'feature_vectors_backup';
    
    console.log('🔄 Rebuilding LanceDB without version history...');
    
    try {
        // Connect to database
        const db = await lancedb.connect(dbPath);
        
        // Export all current data
        console.log('📤 Exporting current data...');
        const table = await db.openTable(tableName);
        const allData = await table.search().execute();
        console.log(`📦 Found ${allData.length} records to preserve`);
        
        // Drop existing table
        console.log('🗑️  Dropping old table...');
        await db.dropTable(tableName);
        
        // Create fresh table with same data
        console.log('🆕 Creating fresh table...');
        const newTable = await db.createTable(tableName, allData);
        
        console.log('✅ Database rebuilt successfully');
        console.log(`📊 Preserved ${allData.length} records`);
        
        // Check new size
        const newStats = await getDirSize(path.join(dbPath, tableName + '.lance'));
        console.log(`💾 New database size: ${formatBytes(newStats)}`);
        
    } catch (error) {
        console.error('❌ Rebuild failed:', error);
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

// Run rebuild
rebuildDatabase();