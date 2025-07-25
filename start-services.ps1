Write-Host "Starting FluidJournal Services..." -ForegroundColor Green

$storageDir = "agentic_memory\storage-agent"
$riskDir = "agentic_memory\risk-service"

# Function to check if Storage Agent is ready
function Test-StorageAgentReady {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3015/health" -TimeoutSec 2 -UseBasicParsing
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

# Start Storage Agent first
if (Test-Path $storageDir) {
    Write-Host "Starting Storage Agent..." -ForegroundColor Magenta
    Start-Process "wt" -ArgumentList "--title", "[STORAGE]", "-d", $storageDir, "powershell", "-NoExit", "-Command", "npm start"
    
    # Wait for Storage Agent to be ready
    Write-Host "Waiting for Storage Agent to initialize..." -ForegroundColor Yellow
    $maxWait = 30 # Maximum wait time in seconds
    $waited = 0
    
    do {
        Start-Sleep 2
        $waited += 2
        Write-Host "." -NoNewline -ForegroundColor Yellow
        
        if ($waited -ge $maxWait) {
            Write-Host ""
            Write-Host "Warning: Storage Agent taking longer than expected to start" -ForegroundColor Yellow
            Write-Host "Proceeding to start Risk Service..." -ForegroundColor Yellow
            break
        }
    } while (-not (Test-StorageAgentReady))
    
    if (Test-StorageAgentReady) {
        Write-Host ""
        Write-Host "Storage Agent ready!" -ForegroundColor Green
    }
} else {
    Write-Host "Storage Agent directory not found: $storageDir" -ForegroundColor Red
    exit 1
}

# Start Risk Service after Storage Agent is ready
if (Test-Path $riskDir) {
    Write-Host "Starting Risk Service..." -ForegroundColor Cyan  
    Start-Process "wt" -ArgumentList "new-tab", "--title", "[RISK]", "-d", $riskDir, "powershell", "-NoExit", "-Command", "npm start"
    
    Write-Host ""
    Write-Host "Services started successfully!" -ForegroundColor Green
    Write-Host "Storage Agent - Port 3015 (Ready)" -ForegroundColor Magenta
    Write-Host "Risk Service - Port 3017 (Starting...)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Both services are running in separate Windows Terminal tabs" -ForegroundColor Green
} else {
    Write-Host "Risk Service directory not found: $riskDir" -ForegroundColor Red
    exit 1
}