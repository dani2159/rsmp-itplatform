@echo off
:: ============================================================
::  RSMP-IT Agent Windows Uninstaller
::  Jalankan sebagai Administrator: klik kanan -> Run as Admin
:: ============================================================
title RSMP-IT Agent Uninstaller

echo.
echo  ============================================
echo   RSMP-IT Platform - Windows Agent Uninstaller
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

if not exist "C:\RS-Agent\rs-agent.ps1" (
    echo  [!] C:\RS-Agent\rs-agent.ps1 tidak ditemukan, agent mungkin belum terinstall.
    goto cleanup
)

echo  [1/2] Stop dan hapus service/scheduled task...
powershell -ExecutionPolicy Bypass -File "C:\RS-Agent\rs-agent.ps1" -Uninstall

:cleanup
echo  [2/2] Hapus folder agent dan rule firewall...
cd /d "%SystemDrive%\"
rmdir /S /Q "C:\RS-Agent" 2>nul
netsh advfirewall firewall delete rule name="RSMP-IT ICMP Allow" >nul 2>&1
netsh advfirewall firewall delete rule name="RSMP-IT VNC" >nul 2>&1

echo.
echo  ============================================
echo   AGENT UNINSTALLED
echo  ============================================
echo   Catatan:
echo   - WinRM TIDAK dinonaktifkan otomatis
echo     (fitur OS umum, bukan spesifik agent)
echo   - Client entry di dashboard RSMP TIDAK otomatis
echo     terhapus, hapus manual dari halaman Clients
echo  ============================================
echo.
pause
