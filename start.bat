@echo off
cd /d "%~dp0"
if not exist node_modules (
    echo Installing dependencies...
    npm install
)
echo Starting Fish Audio Voice server...
node server.js
