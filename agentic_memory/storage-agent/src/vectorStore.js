const lancedb = require('vectordb');
const path = require('path');
const fs = require('fs').promises;

class VectorStore {
  constructor() {
    this.db = null;
    this.table = null;
    this.dbPath = process.env.LANCEDB_PATH || './data/vectors';
    this.tableName = 'feature_vectors';
    
    // Dynamic features - will be determined by first vector stored
    this.featureNames = null;
    this.featureCount = 0;
  }

  async initialize() {
    try {
      console.log(`Vector store initializing...`);
      
      // Ensure data directory exists
      await fs.mkdir(this.dbPath, { recursive: true });
      
      // Connect to LanceDB with versioning disabled
      this.db = await lancedb.connect(this.dbPath, {
        storageOptions: {
          enableV2ManifestPaths: false,
          maxVersions: 1  // Keep only current version
        }
      });
      
      // Check if table exists, create if not
      const tables = await this.db.tableNames();
      
      if (!tables.includes(this.tableName)) {
        await this.createTable();
      } else {
        this.table = await this.db.openTable(this.tableName);
      }
      
      console.log(`Vector store initialized - features will be determined from stored data`);
      return true;
      
    } catch (error) {
      console.error('Failed to initialize vector store:', error);
      throw error;
    }
  }

  async createTable() {
    try {
      // Create sample data with proper vector format for LanceDB schema inference
      // Create table with dummy schema - features will be dynamic
      // LanceDB needs non-empty arrays to infer schema
      // Minimal schema - only essential fields for optimal storage
      const sampleData = [{
        // Core identifiers (8 bytes each)
        id: 'sample',
        timestamp: Date.now(), // Use epoch milliseconds (8 bytes vs Date object ~24 bytes)
        entrySignalId: 'sample_entry',
        sessionId: 'sample-session', // Unique ID per backtest session
        
        // Trade basics (compact representations)
        inst: 'MGC', // Shortened field name
        type: 'SAMPLE', // Shortened field name  
        dir: 'L', // L/S instead of long/short (1 byte vs 4-5 bytes)
        qty: 1, // int16 sufficient for position size
        
        // Features as Float32Array for optimal packing
        features: new Float32Array(94), // Exact feature count, Float32 vs Float64
        
        // Outcomes (Float32 sufficient for PnL precision)
        pnl: 0.0,
        pnlPts: 0.0,
        pnlPC: 0.0, // Per contract
        bars: 0, // int16 for holding bars
        exit: 'S', // Single char exit codes: S=Sample, T=TP, L=SL, M=Manual
        maxP: 0.0, // Max profit
        maxL: 0.0, // Max loss
        good: false // Boolean for good exit
      }];

      this.table = await this.db.createTable(this.tableName, sampleData);
      
      // Remove sample data and compact immediately
      await this.table.delete('id = "sample"');
      await this.table.compactFiles(); // Prevent version buildup
      
      console.log(`Created LanceDB table '${this.tableName}' with dynamic schema`);
      
    } catch (error) {
      console.error('Failed to create LanceDB table:', error);
      throw error;
    }
  }

  async storeVector(vectorData) {
    try {
      console.log('\n[VECTOR-STORE] storeVector called with:', {
        entrySignalId: vectorData.entrySignalId,
        instrument: vectorData.instrument,
        recordType: vectorData.recordType,
        hasFeatures: !!vectorData.features,
        hasOutcome: !!vectorData.outcome,
        timestamp: vectorData.timestamp
      });
      
      const {
        entrySignalId,
        instrument, 
        timestamp,
        sessionId,
        entryType,
        direction = 'unknown',
        timeframeMinutes = 1, // Default to 1-minute if not provided
        quantity = 1, // Default to 1 contract if not provided
        features,
        riskUsed = {},
        outcome,
        recordType = 'UNIFIED', // Force UNIFIED for all new records
        status = 'UNIFIED'      // Force UNIFIED status
      } = vectorData;

      // Generate unique ID
      const id = `${entrySignalId}_${Date.now()}`;
      
      // Convert features object to array for vector storage (only for FEATURES and UNIFIED records)
      let featureArray = new Float32Array(100); // Default empty array
      let featureNames = []; // Default empty array
      let featuresJson = '{}'; // Default empty JSON
      
      if (recordType === 'OUTCOME') {
        // OUTCOME records don't have features - use defaults already set above
        console.log(`[VECTOR-STORE] Storing OUTCOME record for ${entrySignalId}`);
        
      } else if (typeof features === 'object' && !Array.isArray(features) && features !== null) {
        // FEATURES or UNIFIED records with actual features
        featureNames = Object.keys(features).sort(); // Sort for consistency
        featureArray = new Float32Array(featureNames.length);
        
        featureNames.forEach((name, idx) => {
          featureArray[idx] = typeof features[name] === 'number' ? features[name] : 0;
        });
        
        // Store feature names if this is our first vector
        if (!this.featureNames) {
          this.featureNames = featureNames;
          this.featureCount = featureNames.length;
          console.log(`[VECTOR-STORE] Initialized with ${this.featureCount} features from first vector`);
        }
        
        console.log(`[VECTOR-STORE] Storing ${recordType} record with ${featureArray.length} features`);
        
        // Pad to 100 features for consistent schema (LanceDB requirement)
        if (featureArray.length < 100) {
          const paddedArray = new Float32Array(100);
          paddedArray.set(featureArray);
          featureArray = paddedArray;
        }
        
        featuresJson = JSON.stringify(features);
        
      } else if (recordType === 'FEATURES') {
        throw new Error('FEATURES records must have a valid features object');
      } else {
        // Default case for backward compatibility
        throw new Error('Features must be an object with named features');
      }

      // Process trajectory data (profitByBar)
      let profitByBarArray = new Float32Array(50); // Default empty trajectory
      let profitByBarJson = '{}';
      let trajectoryBars = 0;
      
      // Check multiple possible locations for profitByBar data
      const profitByBarDict = outcome?.profitByBar || 
                             outcome?.positionOutcome?.profitByBar || 
                             vectorData.profitByBar || 
                             null;
      
      if (profitByBarDict) {
        // Handle Dictionary<int,double> from NinjaTrader
        const profitByBarObj = {};
        
        // If it's already an object/dictionary
        if (typeof profitByBarDict === 'object' && !Array.isArray(profitByBarDict)) {
          // Find max bar index to determine trajectory length
          const barIndices = Object.keys(profitByBarDict).map(k => parseInt(k)).filter(k => !isNaN(k));
          trajectoryBars = barIndices.length > 0 ? Math.max(...barIndices) + 1 : 0;
          
          // Fill the array with trajectory values
          for (let i = 0; i < Math.min(trajectoryBars, 50); i++) {
            const value = profitByBarDict[i.toString()] || profitByBarDict[i] || 0;
            profitByBarArray[i] = typeof value === 'number' ? value : 0;
            profitByBarObj[i] = profitByBarArray[i];
          }
          
          profitByBarJson = JSON.stringify(profitByBarObj);
          console.log(`[TRAJECTORY] Stored ${trajectoryBars} bars of P&L trajectory for ${entrySignalId}`);
        }
      } else {
        console.log(`[TRAJECTORY] No profitByBar data found for ${entrySignalId}, using empty trajectory`);
      }

      const record = {
        id,
        timestamp: new Date(timestamp),
        entrySignalId,
        sessionId: sessionId || 'unknown', // Store session ID for backtest separation
        instrument,
        entryType: entryType || 'UNKNOWN',
        direction: direction || 'unknown',
        timeframeMinutes: timeframeMinutes || 1, // NEW: Store timeframe in minutes
        quantity: quantity || 1, // NEW: Store position size (number of contracts)
        // Store ALL features as both array and JSON for flexibility
        features: Array.from(featureArray), // Full feature array for similarity search
        featuresJson: featuresJson, // Features as JSON for analysis
        featureNames: featureNames, // Track feature names for this vector (guaranteed array)
        featureCount: featureArray.length,
        // Force UNIFIED for all new records (legacy records will remain as-is)
        recordType: 'UNIFIED',
        status: 'UNIFIED',
        // Risk and outcome data (may be empty for FEATURES records)
        stopLoss: riskUsed?.stopLoss || (outcome?.stopLoss || 10.0),
        takeProfit: riskUsed?.takeProfit || (outcome?.takeProfit || 20.0), 
        virtualStop: riskUsed?.virtualStop || (outcome?.virtualStop || 0.0),
        pnl: outcome?.pnl || 0.0,
        pnlPoints: outcome?.pnlPoints || 0.0,
        // NEW: Normalized PnL per contract for fair comparison across position sizes
        pnlPerContract: (quantity > 0) ? (outcome?.pnl || 0.0) / quantity : 0.0,
        pnlPointsPerContract: (quantity > 0) ? (outcome?.pnlPoints || 0.0) / quantity : 0.0,
        holdingBars: outcome?.holdingBars || 0,
        exitReason: outcome?.exitReason || 'UNKNOWN',
        maxProfit: outcome?.maxProfit || 0.0,
        maxLoss: outcome?.maxLoss || 0.0,
        wasGoodExit: outcome?.wasGoodExit || false,
        // Trajectory data
        profitByBar: Array.from(profitByBarArray),
        profitByBarJson: profitByBarJson,
        trajectoryBars: trajectoryBars
      };

      console.log('[VECTOR-STORE] About to add record to table:', {
        id: record.id,
        entrySignalId: record.entrySignalId,
        recordType: record.recordType,
        featureCount: record.featureCount,
        hasProfitByBar: !!record.profitByBar,
        trajectoryBars: record.trajectoryBars
      });

      const start = Date.now();
      try {
        await this.table.add([record]);
        const duration = Date.now() - start;
        
        console.log(`[VECTOR-STORE] ✅ Successfully stored vector ${id} in ${duration}ms`);
        
        return {
          success: true,
          vectorId: id,
          duration,
          featureCount: featureArray.length
        };
      } catch (addError) {
        console.error('[VECTOR-STORE] ❌ Failed to add record to table:', addError);
        throw addError;
      }
      
    } catch (error) {
      console.error('Failed to store vector:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getVectorsBySessionId(sessionId, limit = 1000) {
    try {
      console.log(`[SESSION-QUERY] Getting vectors for session: ${sessionId}`);
      
      // Query vectors by sessionId
      const results = await this.table
        .search()
        .where(`sessionId = '${sessionId}'`)
        .limit(limit)
        .execute();
      
      console.log(`[SESSION-QUERY] Found ${results.length} vectors for session ${sessionId}`);
      
      return results;
      
    } catch (error) {
      console.error(`[SESSION-QUERY] Failed to get vectors for session ${sessionId}:`, error);
      throw error;
    }
  }

  async findSimilarVectors(queryFeatures, options = {}) {
    try {
      const {
        entryType,
        instrument,
        limit = 100,
        similarity_threshold = 0.85,
        graduatedFeatures = null,  // NEW: List of specific features to compare
        recordType = 'UNIFIED'      // NEW: Filter by record type (for transparent union)
      } = options;

      console.log(`[SIMILARITY-SEARCH] ${graduatedFeatures ? 'Graduated' : 'Full'} feature similarity search`);
      console.log(`[SIMILARITY-SEARCH] Requested entryType: ${entryType}, instrument: ${instrument}, recordType: ${recordType}, limit: ${limit}, threshold: ${similarity_threshold}`);
      
      if (graduatedFeatures) {
        console.log(`[SIMILARITY-SEARCH] Using ${graduatedFeatures.length} graduated features:`, graduatedFeatures.slice(0, 5));
      }
      
      // Get vectors for comparison, filtered by instrument and recordType
      const queryOptions = { limit: limit * 2 };
      if (instrument) {
        queryOptions.instrument = instrument;
      }
      
      let allVectors = await this.getVectors(queryOptions);
      
      // Filter by recordType (for transparent union - only return UNIFIED vectors)
      if (recordType) {
        allVectors = allVectors.filter(vector => 
          (vector.recordType === recordType) || 
          (!vector.recordType && recordType === 'UNIFIED') // Backward compatibility
        );
      }
      
      console.log(`[SIMILARITY-SEARCH] Retrieved ${allVectors.length} ${recordType} vectors${instrument ? ` for ${instrument}` : ''} for similarity comparison`);
      
      if (allVectors.length === 0) {
        return [];
      }

      let similarities;

      if (graduatedFeatures && Array.isArray(graduatedFeatures)) {
        // NEW: Graduated feature similarity - compare only specific features
        similarities = this.calculateGraduatedSimilarity(queryFeatures, allVectors, graduatedFeatures);
      } else {
        // Original full vector similarity
        similarities = this.calculateFullVectorSimilarity(queryFeatures, allVectors);
      }

      // Filter by similarity threshold and sort
      const filteredResults = similarities
        .filter(item => item.similarity >= similarity_threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
        .map(item => ({
          ...item.vector,
          _distance: 1.0 - item.similarity, // Convert similarity to distance
          _similarity_score: item.similarity,
          _matched_features: item.matchedFeatures || graduatedFeatures?.length || 'full'
        }));

      console.log(`[SIMILARITY-SEARCH] Found ${filteredResults.length} vectors above threshold ${similarity_threshold}`);
      if (filteredResults.length > 0) {
        console.log(`[SIMILARITY-SEARCH] Top similarity: ${filteredResults[0]._similarity_score.toFixed(3)}`);
      }

      return filteredResults;
      
    } catch (error) {
      console.error('Failed to find similar vectors:', error);
      throw error;
    }
  }

  // NEW: Calculate similarity using only graduated features
  calculateGraduatedSimilarity(queryFeatures, allVectors, graduatedFeatures) {
    console.log(`[GRADUATED-SIMILARITY] Comparing graduated features only`);
    
    return allVectors.map(vector => {
      try {
        // Parse stored features
        const storedFeatures = JSON.parse(vector.featuresJson || '{}');
        
        // Extract graduated features from both query and stored
        const queryGraduated = this.extractSpecificFeatures(queryFeatures, graduatedFeatures);
        const storedGraduated = this.extractSpecificFeatures(storedFeatures, graduatedFeatures);
        
        if (queryGraduated.length === 0 || storedGraduated.length === 0) {
          return { vector, similarity: 0, matchedFeatures: 0 };
        }

        // Calculate feature-by-feature similarity and average
        let totalSimilarity = 0;
        let validComparisons = 0;

        for (let i = 0; i < graduatedFeatures.length; i++) {
          const queryVal = queryGraduated[i];
          const storedVal = storedGraduated[i];
          
          if (typeof queryVal === 'number' && typeof storedVal === 'number' && 
              !isNaN(queryVal) && !isNaN(storedVal)) {
            
            // Calculate normalized similarity for this feature (0-1 scale)
            const featureSimilarity = this.calculateFeatureSimilarity(queryVal, storedVal);
            totalSimilarity += featureSimilarity;
            validComparisons++;
          }
        }

        const avgSimilarity = validComparisons > 0 ? totalSimilarity / validComparisons : 0;
        
        return { 
          vector, 
          similarity: avgSimilarity,
          matchedFeatures: validComparisons 
        };
        
      } catch (error) {
        return { vector, similarity: 0, matchedFeatures: 0 };
      }
    });
  }

  // NEW: Extract specific features from feature object/array
  extractSpecificFeatures(features, featureNames) {
    const extracted = [];
    
    // Handle both object and array inputs
    if (typeof features === 'object' && !Array.isArray(features)) {
      // Features is an object - extract by name
      featureNames.forEach(name => {
        const value = features[name];
        extracted.push(typeof value === 'number' ? value : 0);
      });
    } else if (Array.isArray(features) && typeof features[0] === 'object') {
      // Features is array of objects - extract by name from first object
      const featureObj = features[0] || {};
      featureNames.forEach(name => {
        const value = featureObj[name];
        extracted.push(typeof value === 'number' ? value : 0);
      });
    } else {
      // Features is array - assume order matches featureNames (fallback)
      featureNames.forEach((name, index) => {
        const value = features[index];
        extracted.push(typeof value === 'number' ? value : 0);
      });
    }
    
    return extracted;
  }

  // NEW: Calculate similarity between two individual feature values
  calculateFeatureSimilarity(val1, val2) {
    // Handle edge cases
    if (val1 === val2) return 1.0;
    if (val1 === 0 && val2 === 0) return 1.0;
    
    // Calculate percentage difference and convert to similarity
    const diff = Math.abs(val1 - val2);
    const avg = (Math.abs(val1) + Math.abs(val2)) / 2;
    
    if (avg === 0) return 1.0; // Both values are zero
    
    const percentDiff = diff / avg;
    
    // Convert percentage difference to similarity (0-1 scale)
    // 0% diff = 1.0 similarity, 100% diff = 0.0 similarity
    return Math.max(0, 1.0 - Math.min(1.0, percentDiff));
  }

  // Original full vector similarity (kept for backward compatibility)
  calculateFullVectorSimilarity(queryFeatures, allVectors) {
    // Ensure query features is proper array
    let queryVector;
    if (Array.isArray(queryFeatures)) {
      queryVector = queryFeatures;
    } else if (queryFeatures instanceof Float32Array) {
      queryVector = Array.from(queryFeatures);
    } else {
      throw new Error('Query features must be an array or Float32Array');
    }

    return allVectors.map(vector => {
      const vectorFeatures = vector.features;
      if (!vectorFeatures || vectorFeatures.length !== queryVector.length) {
        return { vector, similarity: 0 };
      }

      // Cosine similarity calculation
      let dotProduct = 0;
      let queryMagnitude = 0;
      let vectorMagnitude = 0;

      for (let i = 0; i < queryVector.length; i++) {
        dotProduct += queryVector[i] * vectorFeatures[i];
        queryMagnitude += queryVector[i] * queryVector[i];
        vectorMagnitude += vectorFeatures[i] * vectorFeatures[i];
      }

      queryMagnitude = Math.sqrt(queryMagnitude);
      vectorMagnitude = Math.sqrt(vectorMagnitude);

      const similarity = queryMagnitude > 0 && vectorMagnitude > 0 
        ? dotProduct / (queryMagnitude * vectorMagnitude)
        : 0;

      return { vector, similarity };
    });
  }

  // Normalize instrument name to base symbol (MGC AUG25 -> MGC)
  normalizeInstrumentName(instrument) {
    if (!instrument) return null;
    
    // Extract base symbol from contract name
    // Examples: "MGC AUG25" -> "MGC", "ES SEP25" -> "ES", "NQ DEC24" -> "NQ"
    const parts = instrument.trim().split(/\s+/);
    return parts[0].toUpperCase();
  }

  async getVectors(options = {}) {
    try {
      const {
        instrument,
        since,
        limit = 100000,
        entryType,
        timeframeMinutes  // NEW: Filter by timeframe
      } = options;

      // Build filter conditions
      const filters = [];
      
      if (instrument) {
        // Normalize instrument name and filter by base symbol
        const normalizedInstrument = this.normalizeInstrumentName(instrument);
        if (normalizedInstrument) {
          // Match both exact instrument and those starting with base symbol
          filters.push(`(instrument = '${instrument}' OR instrument LIKE '${normalizedInstrument} %' OR instrument = '${normalizedInstrument}')`);
        }
      }
      
      if (entryType) {
        filters.push(`"entryType" = '${entryType}'`);
      }
      
      if (timeframeMinutes) {
        filters.push(`timeframeMinutes = ${timeframeMinutes}`);
      }
      
      if (since) {
        const sinceTimestamp = since.toISOString();
        filters.push(`timestamp >= '${sinceTimestamp}'`);
      }
      
      // Use filter() for queries
      let query;
      if (filters.length > 0) {
        query = this.table.filter(filters.join(' AND ')).limit(limit);
      } else {
        // Get all vectors if no filters
        query = this.table.filter('id IS NOT NULL').limit(limit);
      }
      
      const results = await query.execute();
      return results;
      
    } catch (error) {
      console.error('Failed to get vectors:', error);
      throw error;
    }
  }

  // NEW: Update vector status (for fragment cleanup after union)
  async updateVectorStatus(vectorId, newStatus) {
    try {
      // In LanceDB, we can't update records directly, but we can mark them as processed
      // For now, we'll just log this operation since it's used for cleanup tracking
      console.log(`[VECTOR-STORE] Marking vector ${vectorId} as ${newStatus} (logged for cleanup tracking)`);
      return true;
    } catch (error) {
      console.error(`Failed to update vector status for ${vectorId}:`, error);
      return false;
    }
  }

  async getStats() {
    try {
      console.log('[VECTOR-STORE] Getting stats...');
      
      // Check if table is initialized
      if (!this.table) {
        console.log('[VECTOR-STORE] Table not initialized yet');
        return {
          totalVectors: 0,
          instrumentCounts: {},
          entryTypeCounts: {},
          outcomeStats: {
            totalWins: 0,
            totalLosses: 0,
            avgPnl: 0,
            avgHoldingBars: 0
          },
          featureCount: 0,
          storedFeatures: [],
          lastUpdated: new Date().toISOString()
        };
      }
      
      // Get all vectors using filter with no conditions (gets everything)
      const allVectors = await this.table.filter('id IS NOT NULL').limit(1000000).execute();
      const totalCount = allVectors.length;
      console.log(`[VECTOR-STORE] Found ${totalCount} total vectors for stats`);
      
      // Group by instrument and entryType
      const instrumentCounts = {};
      const entryTypeCounts = {};
      const outcomeStats = {
        totalWins: 0,
        totalLosses: 0,
        avgPnl: 0,
        avgHoldingBars: 0
      };
      
      let totalPnl = 0;
      let totalHoldingBars = 0;
      
      allVectors.forEach(vector => {
        // Instrument counts
        instrumentCounts[vector.instrument] = (instrumentCounts[vector.instrument] || 0) + 1;
        
        // Entry type counts
        entryTypeCounts[vector.entryType] = (entryTypeCounts[vector.entryType] || 0) + 1;
        
        // Outcome stats
        if (vector.pnl > 0) {
          outcomeStats.totalWins++;
        } else {
          outcomeStats.totalLosses++;
        }
        
        totalPnl += vector.pnl;
        totalHoldingBars += vector.holdingBars;
      });
      
      if (totalCount > 0) {
        outcomeStats.avgPnl = totalPnl / totalCount;
        outcomeStats.avgHoldingBars = totalHoldingBars / totalCount;
      }
      
      // Calculate actual feature count from stored vectors
      let actualFeatureCount = this.featureCount || 0;
      let storedFeatureNames = this.featureNames || [];
      
      if (allVectors.length > 0 && (!this.featureCount || !this.featureNames)) {
        // Get feature info from the first REAL trading vector (skip schema records)
        const realVector = allVectors.find(v => v.instrument !== 'SCHEMA' && v.entryType !== 'SCHEMA_RECORD' && v.featureCount > 10);
        if (realVector && realVector.featureCount) {
          actualFeatureCount = realVector.featureCount;
        }
        if (realVector && realVector.featureNames && Array.isArray(realVector.featureNames)) {
          storedFeatureNames = realVector.featureNames;
          actualFeatureCount = storedFeatureNames.length;
        }
        
        // Update instance variables for future use
        this.featureCount = actualFeatureCount;
        this.featureNames = storedFeatureNames;
        
        console.log(`[VECTOR-STORE] Restored feature info: ${actualFeatureCount} features`);
      }

      return {
        totalVectors: totalCount,
        instrumentCounts,
        entryTypeCounts,
        outcomeStats,
        featureCount: actualFeatureCount,
        storedFeatures: storedFeatureNames,
        lastUpdated: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('Failed to get stats:', error);
      throw error;
    }
  }

  async deleteVector(vectorId) {
    try {
      if (!this.table) {
        return { success: false, error: 'Table not initialized' };
      }

      // Delete the vector by ID
      await this.table.delete(`id = '${vectorId}'`);
      
      console.log(`[VECTOR-STORE] Deleted vector: ${vectorId}`);
      
      return { success: true };
      
    } catch (error) {
      console.error('Failed to delete vector:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteBulkVectors(vectorIds) {
    try {
      if (!this.table) {
        return { 
          deletedCount: 0, 
          failedCount: vectorIds.length, 
          failedIds: vectorIds,
          error: 'Table not initialized' 
        };
      }

      let deletedCount = 0;
      let failedCount = 0;
      const failedIds = [];

      console.log(`[VECTOR-STORE] Starting bulk deletion of ${vectorIds.length} vectors`);

      // Delete vectors in batches to avoid query length limits
      const batchSize = 50;
      for (let i = 0; i < vectorIds.length; i += batchSize) {
        const batch = vectorIds.slice(i, i + batchSize);
        
        try {
          // Create IN clause for batch deletion
          const idList = batch.map(id => `'${id}'`).join(', ');
          const deleteQuery = `id IN (${idList})`;
          
          await this.table.delete(deleteQuery);
          
          deletedCount += batch.length;
          console.log(`[VECTOR-STORE] Deleted batch ${Math.floor(i/batchSize) + 1}: ${batch.length} vectors`);
          
        } catch (error) {
          console.error(`[VECTOR-STORE] Failed to delete batch ${Math.floor(i/batchSize) + 1}:`, error.message);
          failedCount += batch.length;
          failedIds.push(...batch);
        }
      }

      console.log(`[VECTOR-STORE] Bulk deletion completed: ${deletedCount} deleted, ${failedCount} failed`);
      
      return {
        deletedCount,
        failedCount,
        failedIds
      };
      
    } catch (error) {
      console.error('Failed to delete vectors in bulk:', error);
      return {
        deletedCount: 0,
        failedCount: vectorIds.length,
        failedIds: vectorIds,
        error: error.message
      };
    }
  }

  async getAggregatedStats() {
    try {
      if (!this.table) {
        throw new Error('Vector store not initialized');
      }

      // Get all records for aggregation using proper LanceDB syntax
      const allRecords = await this.table.filter('id IS NOT NULL').limit(1000000).execute();

      // Aggregate by symbol
      const symbolStats = {};
      const entryTypeStats = {};
      const exitReasonStats = {};
      const hourlyStats = {};

      allRecords.forEach(record => {
        // Symbol aggregation (using 'instrument' field)
        const symbol = record.instrument || 'Unknown';
        if (!symbolStats[symbol]) {
          symbolStats[symbol] = {
            total: 0,
            wins: 0,
            losses: 0,
            totalPnL: 0,
            avgPnL: 0,
            winRate: 0,
            maxWin: 0,
            maxLoss: 0
          };
        }
        
        symbolStats[symbol].total++;
        symbolStats[symbol].totalPnL += record.pnl || 0;
        
        // Determine win/loss based on PnL
        if (record.pnl > 0) {
          symbolStats[symbol].wins++;
          symbolStats[symbol].maxWin = Math.max(symbolStats[symbol].maxWin, record.pnl || 0);
        } else {
          symbolStats[symbol].losses++;
          symbolStats[symbol].maxLoss = Math.min(symbolStats[symbol].maxLoss, record.pnl || 0);
        }

        // Entry type aggregation
        const entryType = record.entryType || 'Unknown';
        if (!entryTypeStats[entryType]) {
          entryTypeStats[entryType] = {
            total: 0,
            wins: 0,
            losses: 0,
            totalPnL: 0,
            avgPnL: 0,
            winRate: 0
          };
        }
        
        entryTypeStats[entryType].total++;
        entryTypeStats[entryType].totalPnL += record.pnl || 0;
        if (record.pnl > 0) {
          entryTypeStats[entryType].wins++;
        } else {
          entryTypeStats[entryType].losses++;
        }

        // Exit reason aggregation
        const exitReason = record.exitReason || 'Unknown';
        if (!exitReasonStats[exitReason]) {
          exitReasonStats[exitReason] = {
            total: 0,
            totalPnL: 0,
            avgPnL: 0
          };
        }
        
        exitReasonStats[exitReason].total++;
        exitReasonStats[exitReason].totalPnL += record.pnl || 0;

        // Hourly aggregation
        if (record.timestamp) {
          const hour = new Date(record.timestamp).getHours();
          if (!hourlyStats[hour]) {
            hourlyStats[hour] = {
              total: 0,
              wins: 0,
              losses: 0,
              winRate: 0
            };
          }
          
          hourlyStats[hour].total++;
          if (record.pnl > 0) {
            hourlyStats[hour].wins++;
          } else {
            hourlyStats[hour].losses++;
          }
        }
      });

      // Calculate final stats
      Object.keys(symbolStats).forEach(symbol => {
        const stats = symbolStats[symbol];
        stats.avgPnL = stats.total > 0 ? stats.totalPnL / stats.total : 0;
        stats.winRate = stats.total > 0 ? stats.wins / stats.total : 0;
      });

      Object.keys(entryTypeStats).forEach(type => {
        const stats = entryTypeStats[type];
        stats.avgPnL = stats.total > 0 ? stats.totalPnL / stats.total : 0;
        stats.winRate = stats.total > 0 ? stats.wins / stats.total : 0;
      });

      Object.keys(exitReasonStats).forEach(reason => {
        const stats = exitReasonStats[reason];
        stats.avgPnL = stats.total > 0 ? stats.totalPnL / stats.total : 0;
      });

      Object.keys(hourlyStats).forEach(hour => {
        const stats = hourlyStats[hour];
        stats.winRate = stats.total > 0 ? stats.wins / stats.total : 0;
      });

      return {
        symbolStats,
        entryTypeStats,
        exitReasonStats,
        hourlyStats,
        totalPatterns: allRecords.length
      };

    } catch (error) {
      console.error('Failed to get aggregated stats:', error);
      throw error;
    }
  }

  async close() {
    try {
      if (this.db) {
        // LanceDB doesn't require explicit closing
        this.db = null;
        this.table = null;
        console.log('Vector store connection closed');
      }
    } catch (error) {
      console.error('Error closing vector store:', error);
    }
  }
}

module.exports = new VectorStore();