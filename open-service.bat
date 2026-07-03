@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js first.
  pause
  exit /b 1
)

netstat -ano | findstr /R /C:":8787 .*LISTENING" >nul
if errorlevel 1 (
  echo Starting local service on http://localhost:8787
  start "" cmd /c "ping 127.0.0.1 -n 3 >nul & start http://localhost:8787"
  node src/server.js
  echo Local service stopped or failed.
  pause
) else (
  echo Local service is already running on port 8787.
  start "" "http://localhost:8787"
  pause
)
