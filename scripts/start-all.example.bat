@echo off
REM Copy this file to start-all.bat (it is git-ignored) and fill in your values.
REM Gotenberg runs in Docker and starts automatically with Docker Desktop
REM (container was created with --restart unless-stopped), so it is not started here.
set WEBHOOK_URL=https://YOUR-DOMAIN.ngrok-free.app/
start "ngrok" ngrok http --url=YOUR-DOMAIN.ngrok-free.app 5678
start "n8n" cmd /k n8n start
