const vectorStore = require('../src/vectorStore');
const fs = require('fs');
const path = require('path');

async function exportToCSV() {
    try {
        console.log('Initializing vector store...');
        await vectorStore.initialize();
        
        console.log('Fetching all vectors...');
        const vectors = await vectorStore.getVectors({ limit: 1000000 });
        
        if (vectors.length === 0) {
            console.log('No vectors found to export');
            return;
        }
        
        console.log(`Found ${vectors.length} vectors to export`);
        
        // Parse first vector to get feature names
        const firstFeatures = JSON.parse(vectors[0].featuresJson || '{}');
        const featureNames = Object.keys(firstFeatures).sort();
        
        // Create CSV header
        const headers = [
            'id',
            'timestamp',
            'instrument',
            'entryType',
            'direction',
            ...featureNames,
            'stopLoss',
            'takeProfit',
            'pnl',
            'pnlPoints',
            'holdingBars',
            'exitReason',
            'maxProfit',
            'maxLoss',
            'wasGoodExit'
        ];
        
        // Create CSV content
        const csvLines = [headers.join(',')];
        
        vectors.forEach(vector => {
            try {
                const features = JSON.parse(vector.featuresJson || '{}');
                
                const row = [
                    vector.id,
                    vector.timestamp,
                    vector.instrument,
                    vector.entryType,
                    vector.direction,
                    ...featureNames.map(name => features[name] || 0),
                    vector.stopLoss,
                    vector.takeProfit,
                    vector.pnl,
                    vector.pnlPoints,
                    vector.holdingBars,
                    vector.exitReason,
                    vector.maxProfit,
                    vector.maxLoss,
                    vector.wasGoodExit
                ];
                
                csvLines.push(row.map(val => {
                    // Escape values containing commas or quotes
                    const strVal = String(val);
                    if (strVal.includes(',') || strVal.includes('"')) {
                        return `"${strVal.replace(/"/g, '""')}"`;
                    }
                    return strVal;
                }).join(','));
                
            } catch (e) {
                console.error('Error processing vector:', e);
            }
        });
        
        // Write to file
        const outputPath = path.join(__dirname, '../exports', `vectors_${new Date().toISOString().split('T')[0]}.csv`);
        await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.promises.writeFile(outputPath, csvLines.join('\n'));
        
        console.log(`\n✅ Export completed successfully!`);
        console.log(`📄 File saved to: ${outputPath}`);
        console.log(`📊 Total rows: ${csvLines.length - 1}`);
        console.log(`📋 Total features: ${featureNames.length}`);
        
    } catch (error) {
        console.error('Export failed:', error);
    } finally {
        await vectorStore.close();
    }
}

exportToCSV();