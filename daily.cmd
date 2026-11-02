@echo off
cd /d "%~dp0"
if not exist data mkdir data
npm run daily >> data\daily-task.log 2>&1
