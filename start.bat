@echo off
cd /d "%~dp0"
title IronWar III Server

echo Starting IronWar III server...
start "IronWar III" /min node server.js

timeout /t 2 /nobreak >nul
echo.
echo Server running at http://localhost:8081
echo Opening browser...
start "" http://localhost:8081
echo.
echo Press Ctrl+C or close this window to stop.
echo.
cmd /k
