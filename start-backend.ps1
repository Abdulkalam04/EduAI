$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$backendPort = 8010
if (-not [string]::IsNullOrWhiteSpace($env:BACKEND_PORT)) {
    $parsedPort = 0
    if (-not [int]::TryParse($env:BACKEND_PORT, [ref]$parsedPort) -or $parsedPort -lt 1 -or $parsedPort -gt 65535) {
        Write-Error "BACKEND_PORT must be a valid TCP port from 1 through 65535."
        exit 1
    }
    $backendPort = $parsedPort
}

$venvPath = Join-Path $projectRoot ".venv"
$backendVenvPath = Join-Path $projectRoot "backend\.venv"
$createdVenv = $false
if (Test-Path (Join-Path $venvPath "Scripts\python.exe")) {
    $pythonPath = Join-Path $venvPath "Scripts\python.exe"
} elseif (Test-Path (Join-Path $backendVenvPath "Scripts\python.exe")) {
    $venvPath = $backendVenvPath
    $pythonPath = Join-Path $venvPath "Scripts\python.exe"
} else {
    Write-Host "No project virtual environment found. Creating .venv..."
    & py -3.11 -m venv $venvPath
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Could not create .venv with Python 3.11. Install Python 3.11 or newer and retry."
        exit 1
    }
    $pythonPath = Join-Path $venvPath "Scripts\python.exe"
    $createdVenv = $true
}

if ($createdVenv) {
    Write-Host "Installing backend requirements into .venv..."
    & $pythonPath -m pip install -r (Join-Path $projectRoot "backend\requirements.txt")
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Backend dependency installation failed."
        exit 1
    }
}

function Test-PortUnavailable([int]$Port, [object[]]$ExcludedRanges) {
    $listener = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($listener) {
        return "already in use"
    }
    foreach ($range in $ExcludedRanges) {
        if ($Port -ge $range.Start -and $Port -le $range.End) {
            return "reserved by Windows"
        }
    }
    return $null
}

$excludedRanges = @()
$netshOutput = netsh interface ipv4 show excludedportrange protocol=tcp
foreach ($line in $netshOutput) {
    if ($line -match '^\s*(\d+)\s+(\d+)\s+\*?\s*$') {
        $excludedRanges += [PSCustomObject]@{
            Start = [int]$Matches[1]
            End = [int]$Matches[2]
        }
    }
}

$unavailableReason = Test-PortUnavailable -Port $backendPort -ExcludedRanges $excludedRanges
if ($unavailableReason) {
    $suggestedPort = $backendPort + 1
    while ($suggestedPort -le 65535 -and (Test-PortUnavailable -Port $suggestedPort -ExcludedRanges $excludedRanges)) {
        $suggestedPort++
    }
    if ($suggestedPort -gt 65535) {
        Write-Error "Port $backendPort is $unavailableReason, and no free TCP port was found."
        exit 1
    }
    Write-Error "Backend port $backendPort is $unavailableReason. Try again with: `$env:BACKEND_PORT=$suggestedPort; npm run dev:backend"
    exit 1
}

$wifiAddress = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi" -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1 -ExpandProperty IPAddress
if (-not $wifiAddress) {
    $wifiAddress = "<your-PC-Wi-Fi-IPv4>"
    Write-Warning "Could not detect the Wi-Fi IPv4 address. Check ipconfig before connecting from your phone."
}

Write-Host "Backend listening on port $backendPort."
Write-Host "Phone API URL: http://${wifiAddress}:$backendPort"
Set-Location (Join-Path $projectRoot "backend")
& $pythonPath -m uvicorn app.main:app --host 0.0.0.0 --port $backendPort --reload
exit $LASTEXITCODE
