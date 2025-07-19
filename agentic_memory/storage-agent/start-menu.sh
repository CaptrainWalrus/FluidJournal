#!/bin/bash

# Agentic Memory Interactive Menu Launcher
# Makes it easy to start the interactive terminal interface

echo "🚀 Starting Agentic Memory Interactive Menu..."
echo ""

# Check if we're in the right directory
if [ ! -f "interactive-menu.js" ]; then
    echo "❌ Error: interactive-menu.js not found"
    echo "💡 Please run this script from the storage-agent directory"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    echo "💡 Please install Node.js to run the interactive menu"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Error: Failed to install dependencies"
        exit 1
    fi
fi

# Start the interactive menu
echo "🎯 Launching interactive menu..."
echo ""
node interactive-menu.js