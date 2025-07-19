#!/bin/bash

echo "🔍 Feature Variation Analysis"
echo ""

# Check if storage agent is running
if ! curl -s http://localhost:3015/health > /dev/null 2>&1; then
    echo "❌ Storage Agent not running on port 3015"
    echo "Please start storage-agent first"
    exit 1
fi

echo "✅ Storage Agent is running"
echo ""

cd /mnt/c/workspace/production-curves/Production/agentic_memory

echo "📊 Running low-variation detection..."
node low-variation-detector.js \
    --variation-threshold 0.001 \
    --unique-threshold 3 \
    --output ./low-variation-report.json

echo ""
echo "📋 Analysis complete! Check the results:"
echo "  - Report: ./low-variation-report.json"
echo "  - Summary: ./low-variation-report.csv"
echo ""
echo "🚨 To start continuous monitoring:"
echo "  node variation-monitor.js"