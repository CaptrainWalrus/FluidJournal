Write-Host "Starting FluidJournal Services..." -ForegroundColor Green

$storageDir = "agentic_memory\storage-agent"
$riskDir = "agentic_memory\risk-service"

if (Test-Path $storageDir) {
    Write-Host "Starting Storage Agent..." -ForegroundColor Magenta
    Start-Process "wt" -ArgumentList "new-tab", "--title", "Storage", "-d", $storageDir, "powershell", "-NoExit", "-Command", "npm start"
    Start-Sleep 2
} else {
    Write-Host "Storage Agent directory not found: $storageDir" -ForegroundColor Red
}

if (Test-Path $riskDir) {
    Write-Host "Starting Risk Service..." -ForegroundColor Cyan  
    Start-Process "wt" -ArgumentList "new-tab", "--title", "Risk", "-d", $riskDir, "powershell", "-NoExit", "-Command", "npm start"
} else {
    Write-Host "Risk Service directory not found: $riskDir" -ForegroundColor Red
}

Write-Host "Services started in Windows Terminal tabs" -ForegroundColor Green
Write-Host "Storage Agent - Port 3015" -ForegroundColor Magenta
Write-Host "Risk Service - Port 3017" -ForegroundColor Cyan