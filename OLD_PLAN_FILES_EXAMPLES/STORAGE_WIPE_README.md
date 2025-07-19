# Agentic Memory Storage Wiper

Scripts to clean up the LanceDB storage matrix, keeping only one record for testing purposes.

## Scripts

### 1. Interactive Wiper (`wipe-storage.js`) ⚠️ Windows Only
- Shows all records in storage
- Lets you choose which record to keep
- Requires confirmation before deletion
- **Note**: Requires Windows PowerShell with proper LanceDB native libraries

### 2. Automated Wiper (`wipe-storage-auto.js`) ⚠️ Windows Only
- Automatically keeps the most recent record
- Deletes all older records
- Optional `--force` flag to skip confirmation
- **Note**: Requires Windows PowerShell with proper LanceDB native libraries

### 3. API-Based Wiper (`wipe-storage-api.js`) ✅ Cross-Platform
- Uses Storage Agent HTTP API for deletions
- Works from WSL, Linux, or Windows
- Automatically keeps the most recent record
- **Recommended**: Works everywhere, no native library issues

### 4. PowerShell Wiper (`wipe-storage.ps1`) 🪟 Windows Native
- Native PowerShell script for Windows
- Can use API or direct file system approach
- Interactive prompts with colored output
- Falls back to directory deletion if API fails

### 5. Complete Wiper (`wipe-storage-complete.js`) 🚀 **FASTEST**
- Deletes ALL records (doesn't keep any)
- Stops Storage Agent and removes data directory
- Much faster than record-by-record deletion
- **Best for large datasets (1000+ records)**

## Usage

### **FASTEST: Complete Wiper (For Large Datasets)**
```bash
# Navigate to agentic_memory directory
cd production-curves/Production/agentic_memory

# FASTEST method - deletes ALL records
node wipe-storage-complete.js

# Or without confirmation
node wipe-storage-complete.js --force
```

### **SELECTIVE: API-Based Wiper (Keeps One Record)**
```bash
# Navigate to agentic_memory directory
cd production-curves/Production/agentic_memory

# Make sure Storage Agent is running first
# Then run the API-based wiper
node wipe-storage-api.js
```

### PowerShell Wiper (Windows)
```powershell
# Navigate to agentic_memory directory
cd production-curves/Production/agentic_memory

# Run PowerShell script
.\wipe-storage.ps1

# Or with force flag (no confirmations)
.\wipe-storage.ps1 -Force
```

### Native Node Scripts (Windows Only - May Have Issues)
```bash
# Navigate to agentic_memory directory
cd production-curves/Production/agentic_memory

# Interactive wiper
node wipe-storage.js

# Automated wiper
node wipe-storage-auto.js
node wipe-storage-auto.js --force
```

## What These Scripts Do

1. **Connect** to the LanceDB storage at `./data/vectors`
2. **Analyze** current storage contents
3. **Display** record information (ID, instrument, entry type, PnL, date)
4. **Keep** one record (your choice or most recent)
5. **Delete** all other records
6. **Verify** the cleanup was successful

## Safety Features

- ✅ Shows you what will be deleted before proceeding
- ✅ Requires confirmation (unless `--force` flag is used)
- ✅ Handles empty storage gracefully
- ✅ Handles already-minimal storage (1 record)
- ✅ Provides detailed logging of all operations
- ✅ Graceful shutdown on interrupts (Ctrl+C)

## When to Use

### Interactive Wiper
- When you want to keep a specific record for testing
- When you want to review all records before deletion
- When you're not sure which record is most representative

### Automated Wiper
- When you want to keep only the most recent record
- For scripted cleanup in development workflows
- When you want to reset training data to a clean state

## Example Output

```
🧹 AUTOMATED AGENTIC MEMORY STORAGE WIPER
═══════════════════════════════════════════════════════════════════════════════
📊 Analyzing current storage...
📈 Found 47 records in storage

📋 KEEPING MOST RECENT RECORD:
   ID: MGC_long_1234567890_1704067200000
   Instrument: MGC
   Entry Type: ORDER_FLOW_IMBALANCE
   PnL: $15.50
   Date: 1/1/2024, 10:00:00 AM

🗑️  Deleting 46 older records...
   ✅ Deleted: MGC_long_1234567889... (12/31/2023)
   ✅ Deleted: MGC_short_1234567888... (12/31/2023)
   ...

✅ Successfully deleted 46 records
📝 Kept 1 record: MGC_long_1234567890_1704067200000

📊 Final storage count: 1 records
```

## Integration with Development Workflow

You can integrate these scripts into your development workflow:

1. **Reset Training Data**: Run before starting a new training cycle
2. **Clean Development Environment**: Remove test data before production runs
3. **Baseline Testing**: Keep one known-good record for comparison
4. **Out-of-Sample Preparation**: Clean storage before running out-of-sample tests

## Notes

- The scripts use the same LanceDB connection as the Storage Agent
- They work with the same `feature_vectors` table
- No downtime required - Storage Agent can be running
- The kept record maintains all feature data and metadata
- Perfect for testing the Risk Service with minimal data