@echo off
rem Starts the Gym Coach bridge. For autostart: Win+R, shell:startup, put a shortcut to this file there.
cd /d "%~dp0"
title Gym Coach bridge
:loop
node bridge.mjs
echo Bridge stopped, restarting in 10 s (close this window to stop it for good)
timeout /t 10 /nobreak >nul
goto loop
