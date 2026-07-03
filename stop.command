#!/bin/bash
set -e

PID="$(lsof -ti tcp:8787 || true)"

if [ -z "$PID" ]; then
  echo "No local service was running on port 8787."
else
  echo "Stopping local service on port 8787. PID=$PID"
  kill $PID
fi

read -n 1 -s -r -p "Press any key to close..."
