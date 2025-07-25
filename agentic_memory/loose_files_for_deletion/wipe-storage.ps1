# PowerShell Script to Wipe Agentic Memory Storage
# This script runs natively on Windows and can access LanceDB properly

param(
    [switch]$Force,
    [string]$StorageUrl = "http://localhost:3015",
    [string]$DataPath = ".\data\vectors"
)

Write-Host "🧹 POWERSHELL AGENTIC MEMORY STORAGE WIPER" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan

# Check if Storage Agent is running
function Test-StorageAgent {
    try {
        Write-Host "🔗 Checking Storage Agent connection..." -ForegroundColor Yellow
        $response = Invoke-RestMethod -Uri "$StorageUrl/health" -Method GET -TimeoutSec 10
        if ($response.status -eq "healthy") {
            Write-Host "✅ Storage Agent is running and healthy" -ForegroundColor Green
            return $true
        } else {
            Write-Host "❌ Storage Agent is not healthy" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "❌ Cannot connect to Storage Agent: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "💡 Make sure Storage Agent is running on port 3015" -ForegroundColor Yellow
        return $false
    }
}

# Get storage statistics
function Get-StorageStats {
    try {
        $response = Invoke-RestMethod -Uri "$StorageUrl/api/stats" -Method GET -TimeoutSec 30
        return $response
    } catch {
        Write-Host "❌ Failed to get storage stats: $($_.Exception.Message)" -ForegroundColor Red
        throw
    }
}

# Get all vectors
function Get-AllVectors {
    try {
        Write-Host "📊 Fetching all vectors from storage..." -ForegroundColor Yellow
        $response = Invoke-RestMethod -Uri "$StorageUrl/api/vectors?limit=10000" -Method GET -TimeoutSec 30
        return $response.vectors
    } catch {
        Write-Host "❌ Failed to get vectors: $($_.Exception.Message)" -ForegroundColor Red
        throw
    }
}

# Alternative: Direct file system approach
function Remove-StorageFiles {
    param([string]$KeepRecordId)
    
    Write-Host "🗑️  ALTERNATIVE: Removing entire storage directory..." -ForegroundColor Yellow
    Write-Host "⚠️  This will remove ALL records (including the one you wanted to keep)" -ForegroundColor Red
    
    if (-not $Force) {
        $confirm = Read-Host "Continue with complete storage wipe? (yes/no)"
        if ($confirm -ne "yes") {
            Write-Host "❌ Operation cancelled" -ForegroundColor Red
            return $false
        }
    }
    
    try {
        if (Test-Path $DataPath) {
            Remove-Item -Path $DataPath -Recurse -Force
            Write-Host "✅ Storage directory removed: $DataPath" -ForegroundColor Green
            
            # Create empty directory for next use
            New-Item -ItemType Directory -Path $DataPath -Force | Out-Null
            Write-Host "📁 Created empty storage directory" -ForegroundColor Green
            
            return $true
        } else {
            Write-Host "📝 Storage directory doesn't exist: $DataPath" -ForegroundColor Yellow
            return $true
        }
    } catch {
        Write-Host "❌ Failed to remove storage directory: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Main execution
function Main {
    # Check Storage Agent
    $isHealthy = Test-StorageAgent
    if (-not $isHealthy) {
        Write-Host "❌ Cannot proceed without Storage Agent connection" -ForegroundColor Red
        Write-Host "💡 Try the direct file system approach instead" -ForegroundColor Yellow
        
        if (-not $Force) {
            $useFileSystem = Read-Host "Use direct file system approach? (yes/no)"
            if ($useFileSystem -eq "yes") {
                $result = Remove-StorageFiles
                if ($result) {
                    Write-Host "✅ Storage wiped successfully using file system approach" -ForegroundColor Green
                } else {
                    Write-Host "❌ Storage wipe failed" -ForegroundColor Red
                }
            }
        }
        return
    }

    try {
        # Get storage stats
        Write-Host "📊 Analyzing current storage..." -ForegroundColor Yellow
        $stats = Get-StorageStats
        
        if (-not $stats.success) {
            Write-Host "❌ Failed to get storage statistics" -ForegroundColor Red
            return
        }

        $totalCount = $stats.stats.totalVectors

        if ($totalCount -eq 0) {
            Write-Host "📝 Storage is already empty - nothing to wipe" -ForegroundColor Green
            return
        }

        if ($totalCount -eq 1) {
            Write-Host "📝 Storage already has only one record - nothing to wipe" -ForegroundColor Green
            return
        }

        Write-Host "📈 Found $totalCount records in storage" -ForegroundColor Cyan
        
        # Get all vectors
        $allVectors = Get-AllVectors
        
        if ($allVectors.Length -eq 0) {
            Write-Host "📝 No vectors returned from API" -ForegroundColor Yellow
            return
        }

        # Sort by timestamp to find most recent
        $sortedVectors = $allVectors | Sort-Object { [DateTime]$_.timestamp } -Descending
        $mostRecentRecord = $sortedVectors[0]
        $recordsToDelete = $sortedVectors[1..($sortedVectors.Length-1)]

        Write-Host "`n📋 MOST RECENT RECORD (TO KEEP):" -ForegroundColor Cyan
        Write-Host "   ID: $($mostRecentRecord.id)" -ForegroundColor White
        Write-Host "   Instrument: $($mostRecentRecord.instrument)" -ForegroundColor White
        Write-Host "   Entry Type: $($mostRecentRecord.entryType)" -ForegroundColor White
        Write-Host "   PnL: $($mostRecentRecord.pnl.ToString('C'))" -ForegroundColor White
        Write-Host "   Date: $([DateTime]$mostRecentRecord.timestamp)" -ForegroundColor White

        Write-Host "`n📋 RECORDS TO DELETE ($($recordsToDelete.Length)):" -ForegroundColor Red
        $recordsToDelete[0..9] | ForEach-Object -Begin { $i = 1 } -Process {
            Write-Host "   $i. $($_.id.Substring(0, [Math]::Min(30, $_.id.Length)))... ($([DateTime]$_.timestamp).ToShortDateString())" -ForegroundColor Gray
            $i++
        }
        
        if ($recordsToDelete.Length -gt 10) {
            Write-Host "   ... and $($recordsToDelete.Length - 10) more records" -ForegroundColor Gray
        }

        Write-Host "`n⚠️  LIMITATION: The Storage Agent API doesn't currently support individual record deletion." -ForegroundColor Yellow
        Write-Host "💡 ALTERNATIVE SOLUTIONS:" -ForegroundColor Yellow
        Write-Host "   1. Stop Storage Agent and delete the data directory" -ForegroundColor White
        Write-Host "   2. Add a delete endpoint to the Storage Agent" -ForegroundColor White
        Write-Host "   3. Use PowerShell direct file system approach" -ForegroundColor White

        if (-not $Force) {
            Write-Host "`n🤔 Would you like to use the direct file system approach?" -ForegroundColor Yellow
            Write-Host "   This will remove ALL records and reset the storage completely." -ForegroundColor Red
            $useFileSystem = Read-Host "Continue? (yes/no)"
            
            if ($useFileSystem -eq "yes") {
                $result = Remove-StorageFiles -KeepRecordId $mostRecentRecord.id
                if ($result) {
                    Write-Host "✅ Storage wiped successfully" -ForegroundColor Green
                    Write-Host "📝 Note: All records were removed (including the one you wanted to keep)" -ForegroundColor Yellow
                    Write-Host "💡 The storage is now clean and ready for new data" -ForegroundColor Yellow
                } else {
                    Write-Host "❌ Storage wipe failed" -ForegroundColor Red
                }
            } else {
                Write-Host "❌ Operation cancelled" -ForegroundColor Red
            }
        }

    } catch {
        Write-Host "❌ FATAL ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Run the script
Main