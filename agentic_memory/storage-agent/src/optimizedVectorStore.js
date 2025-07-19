const lancedb = require('vectordb');
const path = require('path');
const fs = require('fs').promises;

class OptimizedVectorStore {
  constructor() {
    this.db = null;
    this.table = null;
    this.dbPath = process.env.LANCEDB_PATH || './data/vectors';
    this.tableName = 'feature_vectors';
    this.insertBuffer = [];
    this.bufferSize = 100; // Batch inserts for efficiency
  }

  async initialize() {
    try {
      console.log(`🚀 Optimized Vector Store initializing...`);
      
      await fs.mkdir(this.dbPath, { recursive: true });
      
      // Disable versioning completely
      this.db = await lancedb.connect(this.dbPath, {
        storageOptions: {
          maxVersions: 1,
          enableV2ManifestPaths: false
        }
      });
      
      const tables = await this.db.tableNames();
      
      if (!tables.includes(this.tableName)) {
        await this.createOptimizedTable();
      } else {
        this.table = await this.db.openTable(this.tableName);
      }
      
      console.log(`✅ Optimized Vector Store ready`);
      return true;
      
    } catch (error) {
      console.error('❌ Failed to initialize optimized vector store:', error);
      throw error;
    }
  }

  async createOptimizedTable() {
    // Ultra-compact schema for minimal storage
    const schema = [{
      id: 'init',
      ts: Date.now(),                    // timestamp as epoch ms (8 bytes)
      sig: 'init',                       // entrySignalId 
      sess: 'init',                      // sessionId for backtest separation
      inst: 'MGC',                       // instrument (3-4 chars)
      type: 'INIT',                      // entryType (4-6 chars)
      dir: 'L',                          // direction: L/S (1 byte)
      qty: 1,                            // quantity as int16
      feat: new Float32Array(94),        // features as Float32Array (94*4=376 bytes)
      pnl: 0.0,                          // pnl as float32
      pts: 0.0,                          // pnlPoints as float32  
      pc: 0.0,                           // pnlPerContract as float32
      bars: 0,                           // holdingBars as int16
      exit: 'I',                         // exitReason single char: T=TP, L=SL, M=Manual, B=BE
      maxP: 0.0,                         // maxProfit as float32
      maxL: 0.0,                         // maxLoss as float32
      good: false                        // wasGoodExit boolean
    }];

    this.table = await this.db.createTable(this.tableName, schema);
    await this.table.delete('id = "init"');
    await this.table.compactFiles();
    
    console.log(`📦 Created optimized table with ~400 bytes per record`);
  }

  async storeOptimized(data) {
    const record = {
      id: `${data.entrySignalId}_${Date.now()}`,
      ts: data.timestamp || Date.now(),
      sig: data.entrySignalId,
      sess: data.sessionId || 'unknown', // Session ID for backtest separation
      inst: this.normalizeInstrument(data.instrument),
      type: data.entryType || 'UNK',
      dir: data.direction === 'short' ? 'S' : 'L',
      qty: data.quantity || 1,
      feat: this.packFeatures(data.features),
      pnl: data.outcome?.pnl || 0,
      pts: data.outcome?.pnlPoints || 0,
      pc: data.outcome?.pnlPerContract || data.outcome?.pnl || 0,
      bars: data.outcome?.holdingBars || 0,
      exit: this.encodeExitReason(data.outcome?.exitReason),
      maxP: data.outcome?.maxProfit || 0,
      maxL: data.outcome?.maxLoss || 0,
      good: data.outcome?.wasGoodExit || false
    };

    // Add to buffer for batch insertion
    this.insertBuffer.push(record);
    
    if (this.insertBuffer.length >= this.bufferSize) {
      await this.flushBuffer();
    }
    
    return record.id;
  }

  async flushBuffer() {
    if (this.insertBuffer.length === 0) return;
    
    await this.table.add(this.insertBuffer);
    console.log(`💾 Stored ${this.insertBuffer.length} records (batched)`);
    this.insertBuffer = [];
    
    // Compact every 1000 records to prevent version buildup
    const count = await this.table.countRows();
    if (count % 1000 === 0) {
      await this.table.compactFiles();
      console.log(`🗜️  Auto-compacted at ${count} records`);
    }
  }

  normalizeInstrument(instrument) {
    if (!instrument) return 'UNK';
    return instrument.replace(/\s+AUG25|SEP25|DEC25/g, '').substring(0, 4);
  }

  packFeatures(features) {
    const packed = new Float32Array(94);
    if (!features || typeof features !== 'object') return packed;
    
    const keys = Object.keys(features).sort();
    keys.slice(0, 94).forEach((key, idx) => {
      packed[idx] = parseFloat(features[key]) || 0;
    });
    
    return packed;
  }

  encodeExitReason(reason) {
    if (!reason) return 'U';
    const r = reason.toUpperCase();
    if (r.includes('PROFIT') || r.includes('TP')) return 'T';
    if (r.includes('LOSS') || r.includes('SL')) return 'L';
    if (r.includes('MANUAL')) return 'M';
    if (r.includes('BREAK')) return 'B';
    return 'U';
  }

  async findSimilar(queryFeatures, limit = 10) {
    const packed = this.packFeatures(queryFeatures);
    return await this.table
      .search(packed)
      .limit(limit)
      .execute();
  }

  async getStats() {
    const count = await this.table.countRows();
    const sizeStats = await this.getDatabaseSize();
    
    return {
      totalRecords: count,
      avgBytesPerRecord: Math.round(sizeStats.totalSize / count),
      totalSize: sizeStats.formatted,
      efficiency: `${Math.round(sizeStats.totalSize / count)} bytes/record`
    };
  }

  async getDatabaseSize() {
    const dbDir = path.join(this.dbPath, this.tableName + '.lance');
    let totalSize = 0;
    
    try {
      const items = await fs.readdir(dbDir, { withFileTypes: true });
      for (const item of items) {
        if (item.isFile()) {
          const stats = await fs.stat(path.join(dbDir, item.name));
          totalSize += stats.size;
        }
      }
    } catch (error) {
      console.warn('Could not calculate size:', error.message);
    }
    
    return {
      totalSize,
      formatted: this.formatBytes(totalSize)
    };
  }

  formatBytes(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = OptimizedVectorStore;