$ErrorActionPreference = "Stop"

$containerName = "omniroute"
$port = 20128
$dashboardUrl = "http://localhost:$port/dashboard"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker CLI was not found. Install and start Docker Desktop, then run npm run dev:omniroute again."
    exit 1
}

& docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker Desktop is not running. Start Docker Desktop, then run npm run dev:omniroute again."
    exit 1
}

$containerState = & docker inspect --format "{{.State.Status}}" $containerName 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "The Docker container '$containerName' does not exist. Configure OmniRoute in Docker first."
    exit 1
}

if ($containerState.Trim() -eq "running") {
    Write-Host "OmniRoute is already running on port $port."
    Write-Host "Dashboard: $dashboardUrl"
    exit 0
}

$listeners = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
if ($listeners) {
    $processIds = ($listeners | Select-Object -ExpandProperty OwningProcess -Unique) -join ", "
    Write-Error "Port $port is already in use by process ID(s) $processIds. OmniRoute was not started."
    exit 1
}

Write-Host "Starting the existing '$containerName' container; logs will remain visible here."
& docker start $containerName
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker could not start '$containerName'."
    exit 1
}

Write-Host "OmniRoute API: http://localhost:$port/v1"
Write-Host "Dashboard: $dashboardUrl"
Write-Host "Press Ctrl+C to stop following logs; this does not stop the container."
& docker logs --follow --tail 20 $containerName
if ($LASTEXITCODE -ne 0) {
    Write-Error "Unable to follow logs for '$containerName'."
    exit 1
}
