@echo off
REM Copy this file to start-all.bat (it is git-ignored) and fill in your values.
set WEBHOOK_URL=https://YOUR-DOMAIN.ngrok-free.app/
start "ngrok" ngrok http --url=YOUR-DOMAIN.ngrok-free.app 5678
start "n8n" cmd /k n8n start
start "render" cmd /k node C:\PATH\TO\render-server.js
