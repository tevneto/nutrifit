@echo off
cd /d "%~dp0"
set "PY=py"
where py >nul 2>nul || set "PY=python"
where %PY% >nul 2>nul || (echo Python nao encontrado. Instale em https://www.python.org/downloads/ e marque "Add Python to PATH". & pause & exit /b 1)
rem Abre o navegador 2 segundos depois, quando o servidor ja estiver no ar.
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8000"
%PY% -m http.server 8000
