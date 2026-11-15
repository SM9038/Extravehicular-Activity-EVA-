@echo off
title NASA Interactive 3D Mars Globe - Scientific Data Explorer
cls
echo ======================================================================
echo   NASA INTERACTIVE 3D MARS GLOBE - SCIENTIFIC DATA EXPLORER
echo ======================================================================
echo   Starting local scientific server and launching 3D Mars globe...
echo.

cd /d "%~dp0.."

REM Try python / py launcher
where py >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    py -3.11 desktop\server.py
    if %ERRORLEVEL% NEQ 0 py desktop\server.py
    goto END
)

where python >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    python desktop\server.py
    goto END
)

echo Python not found in system PATH. Opening index.html directly in browser...
start "" "%~dp0..\index.html"

:END
pause
