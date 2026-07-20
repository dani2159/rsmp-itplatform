@echo off
:: ============================================================
::  RSMP-IT Agent Windows Installer
::  Jalankan sebagai Administrator: klik kanan -> Run as Admin
:: ============================================================
title RSMP-IT Agent Installer

echo.
echo  ============================================
echo   RSMP-IT Platform - Windows Agent Installer
echo   Jalankan sebagai Administrator!
echo  ============================================
echo.

:: Check Admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo  [ERROR] Harus dijalankan sebagai Administrator!
    echo  Klik kanan file ini - Run as Administrator
    pause
    exit /b 1
)

:: Input Server URL (skip prompt kalau sudah di-set via env var RS_SERVER_URL)
if not "%RS_SERVER_URL%"=="" set SERVER_URL=%RS_SERVER_URL%
if "%SERVER_URL%"=="" set /p SERVER_URL=Masukkan URL server RSMP (contoh: http://192.168.1.10:8081):
if "%SERVER_URL%"=="" set SERVER_URL=http://192.168.1.10:8081

:: Input Agent Token (skip prompt kalau sudah di-set via env var RS_AGENT_TOKEN)
if not "%RS_AGENT_TOKEN%"=="" set AGENT_TOKEN=%RS_AGENT_TOKEN%
if "%AGENT_TOKEN%"=="" set /p AGENT_TOKEN=Masukkan Agent Token (lihat Settings ^> Agent Token di web admin):
if "%AGENT_TOKEN%"=="" (
    echo.
    echo  [WARNING] Agent Token kosong! Register/heartbeat bakal ditolak server
    echo  kode 401 kalau AGENT_TOKEN di-set di server. Lanjut? Ctrl+C buat batal.
    pause
)

echo.
echo  Server: %SERVER_URL%
echo.

:: Create agent directory
echo  [1/6] Membuat direktori agent...
mkdir "C:\RS-Agent" 2>nul
mkdir "C:\RS-Agent\logs" 2>nul

:: Set PowerShell execution policy
echo  [2/6] Set PowerShell execution policy...
powershell -Command "Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope LocalMachine -Force"

:: Copy PowerShell script
echo  [3/6] Copy agent script...
copy /Y "%~dp0rs-agent.ps1" "C:\RS-Agent\rs-agent.ps1" >nul
if errorlevel 1 (
    echo  [ERROR] Gagal copy rs-agent.ps1
    echo  Pastikan rs-agent.ps1 ada di folder yang sama dengan file ini
    pause
    exit /b 1
)

:: Install agent as service
echo  [4/6] Install sebagai Windows Service...
powershell -ExecutionPolicy Bypass -File "C:\RS-Agent\rs-agent.ps1" -ServerUrl "%SERVER_URL%" -AgentToken "%AGENT_TOKEN%" -Install

:: Allow ping (ICMP Echo) -- remote akses pakai RustDesk, RDP TIDAK diaktifkan
echo  [5/6] Izinkan ping (ICMP) di firewall...
netsh advfirewall firewall add rule name="RSMP-IT ICMP Allow" protocol=icmpv4:8,any dir=in action=allow >nul

:: Enable WinRM
echo  [6/6] Aktifkan WinRM...
powershell -Command "Enable-PSRemoting -Force -SkipNetworkProfileCheck" >nul 2>&1

:: Simpan uninstaller di client (siap dipakai kapan saja)
if exist "%~dp0uninstall-agent-windows.bat" (
    copy /Y "%~dp0uninstall-agent-windows.bat" "C:\RS-Agent\uninstall-agent-windows.bat" >nul
) else (
    powershell -Command "try { Invoke-WebRequest -Uri '%SERVER_URL%/api/agent/download/uninstall-agent-windows.bat' -OutFile 'C:\RS-Agent\uninstall-agent-windows.bat' -UseBasicParsing } catch {}"
)

echo.
echo  ============================================
echo   INSTALASI SELESAI!
echo  ============================================
echo   Agent berjalan sebagai service: RSAgent
echo   Server: %SERVER_URL%
echo   Log: C:\RS-Agent\rs-agent.log
echo.
echo   PC ini akan muncul di dashboard RSMP.
echo   Uninstall: C:\RS-Agent\uninstall-agent-windows.bat (Run as Admin)
echo  ============================================
echo.
pause
