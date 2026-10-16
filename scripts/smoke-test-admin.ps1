# Smoke test: serve local-admin.html and verify it loads over HTTP.
$root = Split-Path -Parent $PSScriptRoot
$p = Start-Process python -ArgumentList '-m','http.server','8891','--directory',$root -PassThru -WindowStyle Hidden
try {
    Start-Sleep -Seconds 2
    $r = Invoke-WebRequest -Uri 'http://localhost:8891/local-admin.html' -UseBasicParsing
    Write-Output ("HTTP " + $r.StatusCode + " length=" + $r.RawContentLength)
    $body = $r.Content
    Write-Output ("has adminUI div: " + ($body -match 'id="adminUI"'))
    Write-Output ("has adminLayout div: " + ($body -match 'id="adminLayout"'))
    Write-Output ("has loginGate div: " + ($body -match '<div id="loginGate">'))
    Write-Output ("has showLocalUI script: " + ($body -match 'showLocalUI'))
} finally {
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
}
