#!/bin/bash
set -e

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Please install Node.js 18 or newer first."
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

if lsof -ti tcp:8787 >/dev/null 2>&1; then
  echo "Local service is already running on port 8787."
  open "http://localhost:8787"
  read -n 1 -s -r -p "Press any key to close..."
  exit 0
fi

echo "Starting local service on http://localhost:8787"
(sleep 2 && open "http://localhost:8787") &
node src/server.js

echo "Local service stopped or failed."
read -n 1 -s -r -p "Press any key to close..."
