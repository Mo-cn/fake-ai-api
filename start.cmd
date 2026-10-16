@echo off
chcp 65001 >nul
title FreeEgg AI Gateway
cd /d "%~dp0"
echo.
echo   FreeEgg AI Gateway  ^(TypeScript ^/ 零依赖^)
echo.
if "%PORT%"=="" set PORT=8841
echo   门户     http://127.0.0.1:%PORT%/
echo   Base URL http://127.0.0.1:%PORT%/v1
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo   [错误] 未检测到 Node.js，请安装 Node 22.18 或更高版本。
  pause
  exit /b 1
)
node src\index.ts
pause
