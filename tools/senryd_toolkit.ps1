<#
  tools\senryd_toolkit.ps1 — minimal backend + infra scaffold
  Usage:
    powershell -ExecutionPolicy Bypass -File .\tools\senryd_toolkit.ps1 init
    powershell -ExecutionPolicy Bypass -File .\tools\senryd_toolkit.ps1 install
    powershell -ExecutionPolicy Bypass -File .\tools\senryd_toolkit.ps1 infra
    powershell -ExecutionPolicy Bypass -File .\tools\senryd_toolkit.ps1 dev
#>

param(
  [Parameter(Position=0)]
  [ValidateSet("init","install","infra","dev")]
  [string]$Action = "init"
)

$ErrorActionPreference = "Stop"

function Write-IfMissing {
  param([string]$Path, [string]$Content)
  $dir = Split-Path $Path -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  if (-not (Test-Path $Path)) {
    $Content | Out-File -Encoding UTF8 -FilePath $Path
    Write-Host "Created $Path"
  } else {
    Write-Host "Skip (exists): $Path"
  }
}

function Init-Senryd {
  Write-Host "Scaffolding SenRyde backend + infra..."

  # Root
  Write-IfMissing "package.json" @"
{
  "name": "senryde",
  "private": true,
  "workspaces": ["apps/*"],
  "scripts": { "dev": "npm run dev -ws --if-present" }
}
"@

  Write-IfMissing ".gitignore" @"
node_modules
.env*
apps/**/node_modules
.next
dist
"@

  Write-IfMissing ".env.example" @"
NODE_ENV=development
JWT_SECRET=change_me
MONGODB_URI=mongodb://localhost:27017/senryde
PORT=4000
"@

  # Infra (MongoDB)
  Write-IfMissing "infra/docker-compose.yml" @"
version: '3.9'
services:
  mongo:
    image: mongo:6
    restart: unless-stopped
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
volumes:
  mongo_data:
"@

  # Backend
  Write-IfMissing "apps/backend/package.json" @"
{
  "name": "senryde-backend",
  "private": true,
  "type": "module",
  "scripts": { "dev": "ts-node src/index.ts" },
  "dependencies": {
    "express": "^4.19.2",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "mongoose": "^8.5.1"
  },
  "devDependencies": {
    "ts-node": "^10.9.2",
    "typescript": "^5.5.4",
    "@types/node": "^20.14.10",
    "@types/express": "^4.17.21"
  }
}
"@

  Write-IfMissing "apps/backend/tsconfig.json" @"
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ES2020",
    "outDir": "dist",
    "rootDir": "src",
    "moduleResolution": "Node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
"@

  Write-IfMissing "apps/backend/src/index.ts" @"
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true, app: 'SenRyde' }));

const PORT = Number(process.env.PORT || 4000);
const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/senryde';

mongoose.connect(MONGO).then(() => {
  app.listen(PORT, () => console.log('SenRyde API running on :' + PORT));
}).catch(err => {
  console.error('Mongo connect error:', err?.message || err);
  process.exit(1);
});
"@

  Write-Host "✅ Init complete."
}

function Install-All {
  Write-Host "Installing dependencies..."
  npm install
  Write-Host "✅ npm install done."
}

function Up-Infra {
  Write-Host "Starting Docker (Mongo)..."
  docker compose -f infra/docker-compose.yml up -d
  Write-Host "✅ Mongo running on 27017."
}

function Dev-All {
  Write-Host "Starting dev servers..."
  npm run dev
}

switch ($Action) {
  "init"    { Init-Senryd }
  "install" { Install-All }
  "infra"   { Up-Infra }
  "dev"     { Dev-All }
}
