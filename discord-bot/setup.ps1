# ─── CatBot Minecraft Discord Bot Setup ───
# Run this on your Windows PC (PowerShell)

$ErrorActionPreference = "Stop"

Write-Host "=== CatBot Minecraft Discord Bot Setup ===" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# 1. Install dependencies
Write-Host "[1/4] Installing Node.js dependencies..." -ForegroundColor Yellow
npm install

# 2. Create .env from example if not exists
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "[2/4] Created .env file. Please edit it with your tokens!" -ForegroundColor Green
  Write-Host ""
  Write-Host "  notepad $ScriptDir\.env"
  Write-Host ""
  Write-Host "  You need to fill in:"
  Write-Host "    - DISCORD_TOKEN"
  Write-Host "    - CHANNEL_ID"
  Write-Host "    - CF_TUNNEL_DOMAIN (your Cloudflare tunnel domain)"
  Write-Host "    - MC_SERVER_DIR (path to your Minecraft server)"
  Write-Host ""
} else {
  Write-Host "[2/4] .env already exists. Skipping." -ForegroundColor Gray
}

# 3. Check cloudflared
Write-Host "[3/4] Checking cloudflared..." -ForegroundColor Yellow
$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($cloudflared) {
  Write-Host "  cloudflared found at: $($cloudflared.Source)" -ForegroundColor Green
} else {
  Write-Host "  cloudflared not found! Install it from:" -ForegroundColor Red
  Write-Host "  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" -ForegroundColor Cyan
}

# 4. Create logs directory
if (-not (Test-Path "logs")) {
  New-Item -ItemType Directory -Path "logs" | Out-Null
}

Write-Host "[4/4] Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "=== How to run ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "  # Test run:"
Write-Host "  node bot.js"
Write-Host ""
Write-Host "  # Run with pm2 (auto-restart):"
Write-Host "  pm2 start ecosystem.config.js"
Write-Host ""
Write-Host "  # Save pm2 config for auto-start on boot:"
Write-Host "  pm2 save"
Write-Host "  pm2 startup"
Write-Host ""
Write-Host "  # Optional: auto-start Minecraft server on bot launch:"
Write-Host "  # Add AUTO_START=true to your .env file"
Write-Host ""
