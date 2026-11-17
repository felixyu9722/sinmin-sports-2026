@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo   Sin Min Middle School 2026 Sports Meet Local Server
echo   Port 8080 (Token-Free Git Sync Enabled)
echo   Keep this window open during the Sports Meet!
echo ============================================================
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8080/admin.html & start http://localhost:8080/tv-display.html"
where py >nul 2>nul
if %errorlevel%==0 (
  py local_server.py 8080
) else (
  python local_server.py 8080
)
pause
