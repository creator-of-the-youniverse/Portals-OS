#!/data/data/com.termux/files/usr/bin/bash

cd ~/projects/Portals-OS || exit 1

echo "======================================"
echo "   ITS YOU ONLINE / PORTALS OS"
echo "   Starting development environment..."
echo "======================================"

# Stop previous instances
pkill -f "node server.js" 2>/dev/null
pkill -f "vite --host 0.0.0.0" 2>/dev/null

sleep 1

echo ""
echo "Starting Express API on :3002..."
node server.js > portals-server.log 2>&1 &

echo "Starting Vite on :5174..."
npx vite --host 0.0.0.0
