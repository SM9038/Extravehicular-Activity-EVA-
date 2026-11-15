@echo off
title NASA Mars Explorer - Global 2D Map (Complete 72-Tile Dataset)
cd /d "%~dp0"
echo ==============================================================
echo  NASA MARS EXPLORER - GLOBAL 2D MAP (72 TILES - 100%% COVERAGE)
echo ==============================================================
echo  Launching local desktop server...
python server.py mars_2d_map.html
if %ERRORLEVEL% NEQ 0 (
    py -3 server.py mars_2d_map.html
)
pause
