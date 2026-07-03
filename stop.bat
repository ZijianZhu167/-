@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set FOUND=0

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":8787 .*LISTENING"') do (
  set FOUND=1
  echo Stopping service on port 8787. PID=%%P
  taskkill /PID %%P /F >nul 2>nul
)

if "%FOUND%"=="0" (
  echo No local service was running on port 8787.
)

pause
