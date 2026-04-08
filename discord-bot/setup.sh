#!/bin/bash
# ─── CatBot Minecraft Discord Bot Setup ───
# Run this on your Raspberry Pi 5

set -e

echo "=== CatBot Minecraft Discord Bot Setup ==="
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 1. Install dependencies
echo "[1/4] Installing Node.js dependencies..."
npm install

# 2. Create .env from example if not exists
if [ ! -f .env ]; then
  cp .env.example .env
  echo "[2/4] Created .env file. Please edit it with your tokens!"
  echo ""
  echo "  nano $SCRIPT_DIR/.env"
  echo ""
  echo "  You need to fill in:"
  echo "    - DISCORD_TOKEN"
  echo "    - CHANNEL_ID"
  echo "    - NGROK_AUTH_TOKEN"
  echo "    - MC_SERVER_DIR (path to your Minecraft server)"
  echo ""
else
  echo "[2/4] .env already exists. Skipping."
fi

# 3. Setup ngrok authtoken
if [ -n "$NGROK_AUTH_TOKEN" ]; then
  echo "[3/4] Configuring ngrok..."
  ngrok config add-authtoken "$NGROK_AUTH_TOKEN"
else
  echo "[3/4] Skipping ngrok config (set NGROK_AUTH_TOKEN in .env first, then run: ngrok config add-authtoken YOUR_TOKEN)"
fi

# 4. Create logs directory
mkdir -p logs

echo "[4/4] Setup complete!"
echo ""
echo "=== How to run ==="
echo ""
echo "  # Test run:"
echo "  node bot.js"
echo ""
echo "  # Run with pm2 (auto-restart):"
echo "  pm2 start ecosystem.config.js"
echo ""
echo "  # Save pm2 config for auto-start on boot:"
echo "  pm2 save"
echo "  pm2 startup"
echo ""
echo "  # Optional: auto-start Minecraft server on bot launch:"
echo "  # Add AUTO_START=true to your .env file"
echo ""
