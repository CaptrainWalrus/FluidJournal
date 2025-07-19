#!/bin/bash

echo "🧠 Starting Feature Importance Analysis..."
echo ""

# Check if storage agent is running
if ! curl -s http://localhost:3015/health > /dev/null 2>&1; then
    echo "❌ Storage Agent not running on port 3015"
    echo "Please start storage-agent first"
    exit 1
fi

echo "✅ Storage Agent is running"
echo ""

# Run the analysis
cd /mnt/c/workspace/production-curves/Production/agentic_memory

echo "📊 Running feature importance analysis..."
node feature-importance-analyzer.js \
    --min-vectors 5 \
    --top-features 15 \
    --output ./feature-selection.json

echo ""
echo "🎯 Analysis complete! Updated feature selection config."
echo ""
echo "📋 To view the results:"
echo "  - Feature selection: ./feature-selection.json"
echo "  - Detailed analysis: ./feature-selection-detailed.json"
echo ""
echo "🔄 Risk Service will automatically use the updated feature selection on next restart."