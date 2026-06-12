@echo off
setlocal EnableExtensions

rem Audiobook Studio launcher — place a copy in your library folder, or run from the repo.
rem Set APP_REPO below if you moved the install, or pass the repo path as the first argument.

if not "%~1"=="" (
  set "APP_REPO=%~1"
) else if not defined APP_REPO (
  set "APP_REPO=%~dp0.."
)
if "%APP_REPO:~-1%"=="\" set "APP_REPO=%APP_REPO:~0,-1%"

if not "%~2"=="" (
  set "WATCH_FOLDER=%~2"
) else if not defined WATCH_FOLDER (
  rem Default: parent of this script (useful when bat lives inside the library)
  set "BOOKS_ROOT=%~dp0"
  if "%BOOKS_ROOT:~-1%"=="\" set "BOOKS_ROOT=%BOOKS_ROOT:~0,-1%"
  set "WATCH_FOLDER=%BOOKS_ROOT%"
)

if not exist "%APP_REPO%\package.json" (
  echo ERROR: Audiobook Studio not found at %APP_REPO%
  echo Set APP_REPO or pass the repo path as the first argument.
  pause
  exit /b 1
)

set "LAUNCH_WEB=%TEMP%\audiobook-studio-web-%RANDOM%.cmd"
set "LAUNCH_WATCH=%TEMP%\audiobook-studio-watch-%RANDOM%.cmd"

(
  echo @echo off
  echo set "WATCH_FOLDER=%WATCH_FOLDER%"
  echo cd /d "%APP_REPO%"
  echo npm run dev
) > "%LAUNCH_WEB%"

(
  echo @echo off
  echo set "WATCH_FOLDER=%WATCH_FOLDER%"
  echo cd /d "%APP_REPO%"
  echo npm run dev:watcher
) > "%LAUNCH_WATCH%"

start "Audiobook Studio — Web" cmd /k ""%LAUNCH_WEB%""
timeout /t 4 /nobreak >nul
start "Audiobook Studio — Watcher" cmd /k ""%LAUNCH_WATCH%""

echo Library root: %WATCH_FOLDER%
echo Open http://127.0.0.1:3001
pause

endlocal
