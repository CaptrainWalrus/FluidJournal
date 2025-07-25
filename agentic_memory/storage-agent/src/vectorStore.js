const lancedb = require('vectordb');
const path = require('path');
const fs = require('fs').promises;

class VectorStore {
  constructor() {
    this.db = null;
    this.table = null;
    // UPDATED: Use new optimized database path (old path archived)
    // Old path './data/vectors' archived to vectors_archived_old_schema_YYYYMMDD
    this.dbPath = process.env.LANCEDB_PATH || './data/vectors_fresh';
    this.tableName = 'feature_vectors';
    
    // Enhanced features - support up to 140 features with behavioral context
    this.featureNames = null;
    this.featureCount = 0;
    this.maxFeatures = 140; // Enhanced feature count
    
    // Duration prediction capabilities
    this.minimumDurationMinutes = 15;
    this.durationBrackets = ['0-5min', '5-15min', '15-30min', '30-60min', '60min+'];
    this.moveTypes = ['spike_reversal', 'trend_continuation', 'consolidation_breakout', 'range_bounce', 'news_spike'];
  }

  async initialize() {
    try {
      console.log(`[VECTOR-INIT] Starting initialization...`);
      console.log(`[VECTOR-INIT] Database path: ${this.dbPath}`);
      
      // Ensure data directory exists
      await fs.mkdir(this.dbPath, { recursive: true });
      console.log(`[VECTOR-INIT] Directory ensured: ${this.dbPath}`);
      
      // List existing files
      const files = await fs.readdir(this.dbPath);
      console.log(`[VECTOR-INIT] Files in database directory:`, files);
      
      // Connect to LanceDB with proper versioning
      console.log(`[VECTOR-INIT] Connecting to LanceDB...`);
      this.db = await lancedb.connect(this.dbPath, {
        storageOptions: {
          enableV2ManifestPaths: false
          // Removed maxVersions limit - let LanceDB manage versions properly
        }
      });
      console.log(`[VECTOR-INIT] Connected to LanceDB`);
      
      // Check if table exists, create if not
      const tables = await this.db.tableNames();
      console.log(`[VECTOR-INIT] Existing tables:`, tables);
      
      if (!tables.includes(this.tableName)) {
        console.log(`[VECTOR-INIT] Table '${this.tableName}' not found, creating...`);
        await this.createTable();
      } else {
        console.log(`[VECTOR-INIT] Opening existing table '${this.tableName}'...`);
        this.table = await this.db.openTable(this.tableName);
        
        // Debug: Check table contents
        try {
          const count = await this.table.filter('id IS NOT NULL').limit(1000000).execute();
          console.log(`[VECTOR-INIT] Table opened with ${count.length} existing records`);
          if (count.length > 0) {
            console.log(`[VECTOR-INIT] First record ID: ${count[0].id}`);
            console.log(`[VECTOR-INIT] Last record ID: ${count[count.length-1].id}`);
          }
        } catch (e) {
          console.log(`[VECTOR-INIT] Could not count records:`, e.message);
        }
      }
      
      console.log(`[VECTOR-INIT] Initialization complete`);
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
        
        // Data type for three-state system
        dataType: 'TRAINING', // TRAINING, RECENT, or OUT_OF_SAMPLE
        
        // Features as Float32Array for optimal packing (enhanced to 140)
        features: new Float32Array(140), // Enhanced feature count, Float32 vs Float64
        
        // Outcomes (Float32 sufficient for PnL precision)
        pnl: 0.0,
        pnlPts: 0.0,
        pnlPC: 0.0, // Per contract
        bars: 0, // int16 for holding bars
        exit: 'S', // Single char exit codes: S=Sample, T=TP, L=SL, M=Manual
        maxP: 0.0, // Max profit
        maxL: 0.0, // Max loss
        good: false, // Boolean for good exit
        
        // ENHANCED: Duration-based outcomes
        sustainedMinutes: 0, // How long the move lasted
        durationBracket: '0-5min', // Duration category
        moveType: 'unknown', // Move classification
        sustainabilityScore: 0.0, // 0-1 sustainability rating
        
        // TRAJECTORY: Bar-by-bar profit tracking
        profitByBar: new Float32Array(2000), // Support up to 2000 bars
        profitByBarJson: '[]', // JSON string for flexible storage
        trajectoryBars: 0, // Number of bars in trajectory
      }];

      this.table = await this.db.createTable(this.tableName, sampleData);
      
      // Remove sample data (without immediate compaction)
      await this.table.delete('id = "sample"');
      
      console.log(`Created LanceDB table '${this.tableName}' with dynamic schema`);
      
    } catch (error) {
      console.error('Failed to create LanceDB table:', error);
      throw error;
    }
  }

  async storeVector(vectorData) {
    // Add write queue to prevent concurrent write conflicts
    if (!this.writeQueue) {
      this.writeQueue = Promise.resolve();
    }
    
    return this.writeQueue = this.writeQueue.then(async () => {
      return this._storeVectorInternal(vectorData);
    });
  }

  async _storeVectorInternal(vectorData) {
    try {
      console.log('\n[VECTOR-STORE] storeVector called with:', {
        entrySignalId: vectorData.entrySignalId,
        instrument: vectorData.instrument,
        recordType: vectorData.recordType,
        hasFeatures: !!vectorData.features,
        hasOutcome: !!vectorData.outcome,
        timestamp: vectorData.timestamp,
        timestampType: typeof vectorData.timestamp,
        timestampDate: vectorData.timestamp ? new Date(vectorData.timestamp).toISOString() : 'undefined'
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
        status = 'UNIFIED',      // Force UNIFIED status
        dataType = 'RECENT'     // Default to RECENT for new trades (better for learning)
      } = vectorData;

      // CRITICAL: Require timestamp from NinjaTrader - NO server time fallbacks
      if (!timestamp) {
        throw new Error('BAR_TIMESTAMP_REQUIRED: All trade data must include timestamp from NinjaTrader bar time');
      }

      // Generate unique ID using provided timestamp, not server time
      const timestampMs = new Date(timestamp).getTime();
      const id = `${entrySignalId}_${timestampMs}`;
      
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
        
        // Pad to 140 features for enhanced schema (LanceDB requirement)
        if (featureArray.length < 140) {
          const paddedArray = new Float32Array(140);
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
      let profitByBarArray = new Float32Array(2000); // Match schema size
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
          
          // Fill the array with trajectory values (up to 2000 bars)
          for (let i = 0; i < Math.min(trajectoryBars, 2000); i++) {
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

      // ENHANCED: Analyze duration and move characteristics
      const durationAnalysis = this.analyzeDuration(outcome, profitByBarDict, trajectoryBars);
      const moveClassification = this.classifyMoveType(features, outcome, durationAnalysis);

      const record = {
        // Match exact schema field names
        id,
        timestamp: timestamp, // Keep as number, not Date object
        entrySignalId,
        sessionId: sessionId || 'unknown',
        
        // Use shortened names to match schema
        inst: instrument, // Schema uses 'inst'
        type: entryType || 'UNKNOWN', // Schema uses 'type'
        dir: direction === 'long' ? 'L' : 'S', // Schema uses 'dir' with L/S
        qty: quantity || 1, // Schema uses 'qty'
        
        dataType: (dataType && dataType !== 'undefined') ? dataType : 'RECENT',
        
        // Features as Float32Array to match schema
        features: featureArray, // Keep as Float32Array
        
        // Outcomes - use exact schema field names
        pnl: outcome?.pnl || 0.0,
        pnlPts: outcome?.pnlPoints || 0.0, // Schema uses 'pnlPts'
        pnlPC: (quantity > 0) ? (outcome?.pnl || 0.0) / quantity : 0.0, // Schema uses 'pnlPC'
        bars: outcome?.holdingBars || 0, // Schema uses 'bars'
        exit: (outcome?.exitReason || 'UNKNOWN').charAt(0), // Schema uses single char
        maxP: outcome?.maxProfit || 0.0, // Schema uses 'maxP'
        maxL: outcome?.maxLoss || 0.0, // Schema uses 'maxL'
        good: outcome?.wasGoodExit || false, // Schema uses 'good'
        
        // Duration fields
        sustainedMinutes: durationAnalysis.sustainedMinutes,
        durationBracket: durationAnalysis.bracket,
        moveType: moveClassification.type,
        sustainabilityScore: moveClassification.sustainabilityScore,
        
        // Trajectory data
        profitByBar: profitByBarArray, // Keep as Float32Array
        profitByBarJson: profitByBarJson,
        trajectoryBars: trajectoryBars
      };

      console.log('[VECTOR-STORE] About to add record to table:', {
        id: record.id,
        entrySignalId: record.entrySignalId,
        inst: record.inst,
        dir: record.dir,
        featureCount: featureArray.length,
        hasProfitByBar: !!record.profitByBar,
        trajectoryBars: record.trajectoryBars
      });

      const start = Date.now();
      
      // Retry logic for commit conflicts
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount <= maxRetries) {
        try {
          await this.table.add([record]);
          const duration = Date.now() - start;
          
          console.log(`[VECTOR-STORE] ✅ Successfully stored vector ${id} in ${duration}ms`);
          
          // DEBUG: Verify the record was actually stored
          try {
            const verifyQuery = await this.table.filter(`id = '${id}'`).execute();
            console.log(`[VECTOR-STORE-DEBUG] Verification query found ${verifyQuery.length} records with ID ${id}`);
            
            // Check total count (must specify limit or defaults to 10!)
            const totalCount = await this.table.filter('id IS NOT NULL').limit(1000000).execute();
            console.log(`[VECTOR-STORE-DEBUG] Total records in table after store: ${totalCount.length}`);
          } catch (verifyError) {
            console.error(`[VECTOR-STORE-DEBUG] Could not verify storage:`, verifyError.message);
          }
          
          return {
            success: true,
            vectorId: id,
            duration,
            featureCount: featureArray.length
          };
          
        } catch (addError) {
          retryCount++;
          
          // Check if it's a commit conflict that we can retry
          if (addError.message && addError.message.includes('Commit conflict') && retryCount <= maxRetries) {
            const delay = Math.pow(2, retryCount) * 100; // Exponential backoff: 200ms, 400ms, 800ms
            console.warn(`[VECTOR-STORE] ⚠️  Commit conflict (retry ${retryCount}/${maxRetries}) - waiting ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          
          // Non-retryable error or max retries exceeded
          console.error('[VECTOR-STORE] ❌ Failed to add record to table:', addError);
          throw addError;
        }
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
      let query = this.table
        .search()
        .where(`sessionId = '${sessionId}'`);
      
      // Apply limit (defaults to 10 if not specified!)
      if (limit && limit > 0) {
        query = query.limit(limit);
      } else {
        // If no limit specified, use a high limit to get all records
        query = query.limit(1000000);
      }
      
      const results = await query.execute();
      
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
        timeframeMinutes,  // NEW: Filter by timeframe
        dataType  // NEW: Filter by data type (TRAINING, RECENT, OUT_OF_SAMPLE)
      } = options;

      // Build filter conditions
      const filters = [];
      
      if (instrument) {
        // Normalize instrument name and filter by base symbol
        const normalizedInstrument = this.normalizeInstrumentName(instrument);
        if (normalizedInstrument) {
          // Match both exact instrument and those starting with base symbol (use 'inst' field)
          filters.push(`(inst = '${instrument}' OR inst LIKE '${normalizedInstrument} %' OR inst = '${normalizedInstrument}')`);
        }
      }
      
      if (entryType) {
        filters.push(`"type" = '${entryType}'`); // Use 'type' field
      }
      
      // timeframeMinutes not in schema - skip
      
      if (dataType) {
        filters.push(`dataType = '${dataType}'`);
      }
      
      if (since) {
        // Convert to epoch milliseconds for numeric comparison
        const sinceTimestamp = since instanceof Date ? since.getTime() : since;
        filters.push(`timestamp >= ${sinceTimestamp}`);
      }
      
      // Use filter() for queries
      let query;
      if (filters.length > 0) {
        query = this.table.filter(filters.join(' AND '));
      } else {
        // Get all vectors if no filters
        query = this.table.filter('id IS NOT NULL');
      }
      
      // Apply limit (defaults to 10 if not specified!)
      if (limit && limit > 0) {
        query = query.limit(limit);
      } else {
        // If no limit specified, use a high limit to get all records
        query = query.limit(1000000);
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
          instrumentBreakdown: {},
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
      
      console.log('[VECTOR-STORE] Executing query for stats...');
      
      // Get all vectors using filter with no conditions (gets everything)
      // IMPORTANT: Must specify limit or it defaults to 10!
      // Use a more reasonable limit for stats
      const allVectors = await this.table.filter('id IS NOT NULL').limit(10000).execute();
      const totalCount = allVectors.length;
      console.log(`[VECTOR-STORE] Found ${totalCount} total vectors for stats`);
      
      // Group by instrument and entryType
      const instrumentCounts = {};
      const instrumentBreakdown = {};
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
        // Instrument counts (use 'inst' field)
        instrumentCounts[vector.inst] = (instrumentCounts[vector.inst] || 0) + 1;
        
        // Detailed instrument breakdown
        if (!instrumentBreakdown[vector.inst]) {
          instrumentBreakdown[vector.inst] = {
            total: 0,
            wins: 0,
            losses: 0,
            totalPnl: 0,
            avgPnl: 0,
            winRate: 0
          };
        }
        
        instrumentBreakdown[vector.inst].total++;
        instrumentBreakdown[vector.inst].totalPnl += vector.pnl || 0;
        
        if (vector.pnl > 0) {
          instrumentBreakdown[vector.inst].wins++;
        } else {
          instrumentBreakdown[vector.inst].losses++;
        }
        
        // Entry type counts (use 'type' field)
        entryTypeCounts[vector.type] = (entryTypeCounts[vector.type] || 0) + 1;
        
        // Outcome stats
        if (vector.pnl > 0) {
          outcomeStats.totalWins++;
        } else {
          outcomeStats.totalLosses++;
        }
        
        totalPnl += vector.pnl;
        totalHoldingBars += vector.bars || 0; // Use 'bars' field
      });
      
      // Calculate averages and win rates for each instrument
      Object.keys(instrumentBreakdown).forEach(instrument => {
        const stats = instrumentBreakdown[instrument];
        stats.avgPnl = stats.total > 0 ? stats.totalPnl / stats.total : 0;
        stats.winRate = stats.total > 0 ? (stats.wins / stats.total * 100).toFixed(1) : '0.0';
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
        const realVector = allVectors.find(v => v.inst !== 'SCHEMA' && v.type !== 'SCHEMA_RECORD' && v.features && v.features.length > 10);
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
        instrumentBreakdown,
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
      // IMPORTANT: Must specify limit or it defaults to 10!
      const allRecords = await this.table.filter('id IS NOT NULL').limit(1000000).execute();

      // Aggregate by symbol
      const symbolStats = {};
      const entryTypeStats = {};
      const exitReasonStats = {};
      const hourlyStats = {};

      allRecords.forEach(record => {
        // Symbol aggregation (using 'instrument' field)
        const symbol = record.inst || 'Unknown';
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
        const entryType = record.type || 'Unknown';
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

  // ENHANCED: Duration analysis methods
  analyzeDuration(outcome, profitByBar, trajectoryBars) {
    let sustainedMinutes = 0;
    let bracket = '0-5min';
    
    // Calculate sustained duration from trajectory or holding bars
    if (trajectoryBars > 0) {
      sustainedMinutes = trajectoryBars; // Each bar = 1 minute
    } else if (outcome?.holdingBars) {
      sustainedMinutes = outcome.holdingBars;
    }
    
    // Classify into duration bracket
    if (sustainedMinutes >= 60) bracket = '60min+';
    else if (sustainedMinutes >= 30) bracket = '30-60min';
    else if (sustainedMinutes >= 15) bracket = '15-30min';
    else if (sustainedMinutes >= 5) bracket = '5-15min';
    
    return {
      sustainedMinutes,
      bracket
    };
  }

  classifyMoveType(features, outcome, durationAnalysis) {
    const pnl = outcome?.pnl || 0;
    const duration = durationAnalysis.sustainedMinutes;
    
    let type = 'unknown';
    let sustainabilityScore = 0.5;
    
    // Basic classification logic
    if (duration < 5) {
      type = 'spike_reversal';
      sustainabilityScore = 0.2;
    } else if (duration >= 30) {
      if (pnl > 0) {
        type = 'trend_continuation';
        sustainabilityScore = 0.8;
      } else {
        type = 'consolidation_breakout';
        sustainabilityScore = 0.6;
      }
    } else {
      type = 'range_bounce';
      sustainabilityScore = 0.5;
    }
    
    return {
      type,
      sustainabilityScore
    };
  }

  // ENHANCED: Duration prediction capability
  async predictDuration(queryFeatures, options = {}) {
    try {
      const {
        instrument,
        minimumDuration = this.minimumDurationMinutes,
        limit = 100
      } = options;
      
      console.log(`[DURATION-PREDICTION] Predicting duration for ${instrument} (minimum: ${minimumDuration}min)`);
      
      // Convert queryFeatures to array if it's an object
      let queryVector = queryFeatures;
      if (typeof queryFeatures === 'object' && !Array.isArray(queryFeatures)) {
        queryVector = Object.values(queryFeatures);
      }
      
      // Find similar patterns
      const similarPatterns = await this.findSimilarVectors(queryVector, {
        instrument,
        limit: limit * 2
      });
      
      if (similarPatterns.length === 0) {
        return {
          predictedDuration: 0,
          confidence: 0,
          durationBrackets: {},
          recommendation: 'INSUFFICIENT_DATA'
        };
      }
      
      // Analyze duration distribution
      const durations = similarPatterns.map(p => p.sustainedMinutes || 0);
      const durationBrackets = this.categorizeDurations(durations);
      
      // Calculate confidence (percentage lasting >= minimum duration)
      const sustainedCount = durations.filter(d => d >= minimumDuration).length;
      const confidence = sustainedCount / durations.length;
      
      // Predict most likely duration (weighted average)
      const predictedDuration = this.calculateWeightedDuration(similarPatterns);
      
      // Determine recommendation
      let recommendation = 'WAIT_FOR_BETTER_SETUP';
      if (confidence >= 0.7) recommendation = 'TAKE_TRADE';
      else if (confidence >= 0.5) recommendation = 'MODERATE_CONFIDENCE';
      
      console.log(`[DURATION-PREDICTION] Prediction: ${predictedDuration.toFixed(1)}min, Confidence: ${(confidence * 100).toFixed(1)}%`);
      
      return {
        predictedDuration,
        confidence,
        durationBrackets,
        recommendation,
        sampleSize: similarPatterns.length
      };
      
    } catch (error) {
      console.error('Failed to predict duration:', error);
      throw error;
    }
  }

  categorizeDurations(durations) {
    const brackets = {
      '0-5min': durations.filter(d => d < 5).length,
      '5-15min': durations.filter(d => d >= 5 && d < 15).length,
      '15-30min': durations.filter(d => d >= 15 && d < 30).length,
      '30-60min': durations.filter(d => d >= 30 && d < 60).length,
      '60min+': durations.filter(d => d >= 60).length
    };
    
    const total = durations.length;
    Object.keys(brackets).forEach(bracket => {
      brackets[bracket] = {
        count: brackets[bracket],
        percentage: total > 0 ? brackets[bracket] / total : 0
      };
    });
    
    return brackets;
  }

  calculateWeightedDuration(patterns) {
    if (patterns.length === 0) return 0;
    
    // Weight by similarity score
    let totalWeighted = 0;
    let totalWeight = 0;
    
    patterns.forEach(pattern => {
      const weight = pattern._similarity_score || 1;
      const duration = pattern.sustainedMinutes || 0;
      
      totalWeighted += duration * weight;
      totalWeight += weight;
    });
    
    return totalWeight > 0 ? totalWeighted / totalWeight : 0;
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