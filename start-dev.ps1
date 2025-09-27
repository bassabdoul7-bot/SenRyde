param(
  [int]$Port = 4000  # default port
)

Write-Host "🔎 Checking port $Port..."
$pid = (netstat -ano | findstr ":$Port" | ForEach-Object { ($_ -split '\s+')[-1] } | Select-Object -First 1)

if ($pid) {
  Write-Host "⚠️ Port $Port in use by PID $pid. Killing..."
  taskkill /PID $pid /F | Out-Null
} else {
  Write-Host "✅ Port $Port is free."
}

Write-Host "🚀 Starting SenRyde backend on port $Port..."
$env:PORT = $Port
npm run dev --workspace apps/backend
