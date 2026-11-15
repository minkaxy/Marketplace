@echo off
cd /d "%~dp0"
node scripts/check-runtime.mjs
if errorlevel 1 goto failed
if not exist .env copy config.example.env .env >nul
node scripts/build.mjs
if errorlevel 1 goto failed
node scripts/start.mjs
if errorlevel 1 goto failed
exit /b 0
:failed
echo See the error above. Install Node.js 24 or newer if required.
pause
exit /b 1
