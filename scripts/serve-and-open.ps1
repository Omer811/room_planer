Param(
  [int]$Port = 8080
)

$Url = "http://localhost:$Port/tests/runner.html"
Write-Host "[serve] Starting on http://localhost:$Port"

Start-Process $Url | Out-Null

if (Get-Command python -ErrorAction SilentlyContinue) {
  python -m http.server $Port
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
  py -m http.server $Port
} else {
  Write-Error "Python not found. Install Python 3 or run a static server."
  exit 1
}

