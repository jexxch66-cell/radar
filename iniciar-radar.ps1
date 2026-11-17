# Lanzador local de RADAR: Docker Desktop -> PostgreSQL -> backend -> frontend -> navegador.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$Host.UI.RawUI.WindowTitle = 'RADAR - lanzador'

function Test-Port([int]$port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try { $client.Connect('127.0.0.1', $port); return $true } catch { return $false } finally { $client.Close() }
}

function Wait-Until([scriptblock]$cond, [int]$timeoutSec, [string]$what) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while (-not (& $cond)) {
        if ((Get-Date) -gt $deadline) { throw "Tiempo agotado esperando: $what" }
        Start-Sleep -Seconds 3
    }
}

function Test-Docker {
    & docker info *> $null
    return $LASTEXITCODE -eq 0
}

try {
    # 1. Docker Desktop
    if (-not (Test-Docker)) {
        Write-Host 'Abriendo Docker Desktop...' -ForegroundColor Cyan
        Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
        Wait-Until { Test-Docker } 240 'Docker Desktop'
    }
    Write-Host 'Docker listo.' -ForegroundColor Green

    # 2. Base de datos
    Write-Host 'Levantando PostgreSQL (radar-db)...' -ForegroundColor Cyan
    Push-Location $root
    & docker compose up -d
    Pop-Location
    Wait-Until { Test-Port 5433 } 60 'PostgreSQL en el puerto 5433'
    Write-Host 'Base de datos lista.' -ForegroundColor Green

    # 3. Backend
    if (Test-Port 8080) {
        Write-Host 'El backend ya esta corriendo en 8080.' -ForegroundColor Yellow
    } else {
        Write-Host 'Iniciando backend (ventana nueva)...' -ForegroundColor Cyan
        Start-Process cmd.exe -ArgumentList '/k', 'title RADAR backend && mvn spring-boot:run' -WorkingDirectory (Join-Path $root 'backend')
    }

    # 4. Frontend
    if (Test-Port 4200) {
        Write-Host 'El frontend ya esta corriendo en 4200.' -ForegroundColor Yellow
    } else {
        Write-Host 'Iniciando frontend (ventana nueva)...' -ForegroundColor Cyan
        $front = Join-Path $root 'frontend'
        $cmd = if (Test-Path (Join-Path $front 'node_modules')) { 'npm start' } else { 'npm install && npm start' }
        Start-Process cmd.exe -ArgumentList '/k', "title RADAR frontend && $cmd" -WorkingDirectory $front
    }

    Write-Host 'Esperando a que backend y frontend respondan (puede tardar 1-2 min)...' -ForegroundColor Cyan
    Wait-Until { (Test-Port 8080) -and (Test-Port 4200) } 600 'backend (8080) y frontend (4200)'

    Start-Process 'http://localhost:4200'
    Write-Host ''
    Write-Host 'RADAR esta listo: http://localhost:4200' -ForegroundColor Green
    Write-Host 'Admin: admin@radar.com / Admin123!'
    Write-Host 'Para detenerlo, cierra las ventanas "RADAR backend" y "RADAR frontend".'
    Start-Sleep -Seconds 8
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    Read-Host 'Presiona Enter para cerrar'
}
