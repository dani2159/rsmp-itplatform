# ============================================================
#  RSMP-IT Agent Windows v3.0
#  Full metrics: CPU, RAM, Disk, Apps, Network, Users, etc.
#  Install: powershell -File rs-agent.ps1 -Install
# ============================================================
param(
    [string]$ServerUrl    = "http://192.168.1.10:8081",
    [string]$ClientId     = "",
    [string]$AgentToken   = "",
    [string]$VncPassword  = "",
    [switch]$Install,
    [switch]$Uninstall
)

$AgentVersion = "3.0.0"
$AgentDir     = "C:\RS-Agent"
$LogFile      = "$AgentDir\rs-agent.log"
$ConfigFile   = "$AgentDir\rs-agent.conf"
$Interval     = 60

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $ts   = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Message"
    Write-Host $line
    try {
        Add-Content -Path $LogFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
        # Rotate jika >5MB
        if ((Get-Item $LogFile -ErrorAction SilentlyContinue).Length -gt 5MB) {
            $content = Get-Content $LogFile -Tail 500
            Set-Content $LogFile -Value $content -Encoding UTF8
        }
    } catch {}
}

function Get-CpuUsage {
    try {
        $cpu = Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average
        return [math]::Round($cpu.Average, 1)
    } catch { return 0.0 }
}

function Get-RamUsage {
    try {
        $os   = Get-WmiObject Win32_OperatingSystem
        $used = $os.TotalVisibleMemorySize - $os.FreePhysicalMemory
        return [math]::Round(($used / $os.TotalVisibleMemorySize) * 100, 1)
    } catch { return 0.0 }
}

function Get-RamDetail {
    try {
        $os      = Get-WmiObject Win32_OperatingSystem
        $totalMB = [math]::Round($os.TotalVisibleMemorySize / 1024, 0)
        $freeMB  = [math]::Round($os.FreePhysicalMemory / 1024, 0)
        $usedMB  = $totalMB - $freeMB
        return "${usedMB}MB/${totalMB}MB"
    } catch { return "" }
}

function Get-DiskUsage {
    try {
        $disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
        return [math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 1)
    } catch { return 0.0 }
}

function Get-DiskDetail {
    try {
        $disk  = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
        $total = [math]::Round($disk.Size / 1GB, 1)
        $used  = [math]::Round(($disk.Size - $disk.FreeSpace) / 1GB, 1)
        return "${used}GB/${total}GB"
    } catch { return "" }
}

function Get-Uptime {
    try {
        $os   = Get-WmiObject Win32_OperatingSystem
        $boot = [Management.ManagementDateTimeConverter]::ToDateTime($os.LastBootUpTime)
        $span = (Get-Date) - $boot
        return "$($span.Days)d $($span.Hours)h $($span.Minutes)m"
    } catch { return "unknown" }
}

function Get-BootTime {
    try {
        $os   = Get-WmiObject Win32_OperatingSystem
        $boot = [Management.ManagementDateTimeConverter]::ToDateTime($os.LastBootUpTime)
        return $boot.ToString("yyyy-MM-dd HH:mm")
    } catch { return "" }
}

function Get-LoadAvg {
    # Windows tidak punya load avg seperti Linux, pakai CPU% sebagai pendekatan
    try {
        $cpu = Get-CpuUsage
        return "$cpu% (1m avg)"
    } catch { return "" }
}

function Get-PendingUpdates {
    try {
        $session  = New-Object -ComObject Microsoft.Update.Session
        $searcher = $session.CreateUpdateSearcher()
        $result   = $searcher.Search("IsInstalled=0 AND Type='Software'")
        return $result.Updates.Count
    } catch { return 0 }
}

function Get-RunningApps {
    try {
        # Ambil proses dengan window (aplikasi GUI)
        $apps = Get-Process | Where-Object {
            $_.MainWindowTitle -ne "" -and $_.CPU -gt 0
        } | Select-Object -First 15 |
          ForEach-Object { $_.ProcessName } |
          Sort-Object -Unique
        return ($apps -join ", ")
    } catch { return "" }
}

function Get-TopProcesses {
    try {
        $procs = Get-Process |
            Sort-Object CPU -Descending |
            Select-Object -First 5 |
            ForEach-Object {
                $cpu = [math]::Round($_.CPU, 1)
                $mem = [math]::Round($_.WorkingSet64 / 1MB, 1)
                "$($_.ProcessName)(cpu:${cpu}s,mem:${mem}MB)"
            }
        return ($procs -join "; ")
    } catch { return "" }
}

function Get-LoggedUsers {
    try {
        $users = query user 2>$null |
            Select-Object -Skip 1 |
            ForEach-Object { ($_ -split '\s+')[1] } |
            Where-Object { $_ -ne "" } |
            Sort-Object -Unique
        return ($users -join ", ")
    } catch {
        return $env:USERNAME
    }
}

function Get-NetworkInfo {
    try {
        $adapter = Get-NetIPAddress -AddressFamily IPv4 |
            Where-Object { $_.IPAddress -notmatch '^127\.' -and $_.PrefixOrigin -ne 'WellKnown' } |
            Select-Object -First 1
        $gw = (Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
               Select-Object -First 1).NextHop
        $mac = (Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } |
                Select-Object -First 1).MacAddress
        $dns = (Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                Select-Object -First 1).ServerAddresses -join ","

        $info = @{
            ip      = $adapter.IPAddress
            iface   = $adapter.InterfaceAlias
            gateway = $gw
            mac     = $mac
            dns     = $dns
        }
        return ($info | ConvertTo-Json -Compress)
    } catch { return "" }
}

function Get-ServicesStatus {
    $services = @("RSAgent", "TermService", "wuauserv", "WinRM", "Spooler")
    $result = @{}
    foreach ($svc in $services) {
        try {
            $s = Get-Service $svc -ErrorAction SilentlyContinue
            $result[$svc] = if ($s) { $s.Status.ToString().ToLower() } else { "not_found" }
        } catch { $result[$svc] = "error" }
    }
    return ($result | ConvertTo-Json -Compress)
}

function Get-InstalledApps {
    try {
        $apps = @()
        $paths = @(
            "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
            "HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
        )
        foreach ($path in $paths) {
            Get-ItemProperty $path -ErrorAction SilentlyContinue |
                Where-Object { $_.DisplayName -and $_.DisplayVersion } |
                ForEach-Object { $apps += "$($_.DisplayName) $($_.DisplayVersion)" }
        }
        return ($apps | Select-Object -First 20 | Sort-Object) -join "; "
    } catch { return "" }
}

function Get-OSInfo {
    try {
        $os = Get-WmiObject Win32_OperatingSystem
        return "$($os.Caption) $($os.Version)"
    } catch { return "Windows" }
}

function Get-LocalIP {
    try {
        # Prefer the adapter that actually has a default gateway (real LAN/internet
        # uplink) -- picking "any non-loopback IPv4" grabs virtual adapters first
        # (VirtualBox host-only, Hyper-V internal switch, VPN, Docker) which aren't
        # reachable from the server, breaking ping/exec against this client.
        $withGw = Get-NetIPConfiguration | Where-Object {
            $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up'
        } | Select-Object -First 1
        # $withGw.IPv4Address bisa lebih dari satu (adapter dgn beberapa IP,
        # umum di mesin ber-VPN) -- buang dulu APIPA (169.254.x, invalid,
        # muncul kalau DHCP gagal di salah satu binding) & loopback, baru
        # ambil satu. Tanpa filter+-First1 ini, .IPAddress balikin ARRAY
        # utuh dan itu bikin query SQL ke server rusak (tiap elemen array
        # jadi 'a','b','c' terpisah pas di-insert).
        if ($withGw) {
            $picked = $withGw.IPv4Address |
                Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
                Select-Object -First 1
            if ($picked) { return $picked.IPAddress }
        }

        (Get-NetIPAddress -AddressFamily IPv4 |
         Where-Object { $_.IPAddress -notmatch '^127\.' -and $_.PrefixOrigin -ne 'WellKnown' } |
         Select-Object -First 1).IPAddress
    } catch { "127.0.0.1" }
}

function Collect-Metrics {
    return @{
        type             = "heartbeat"
        clientId         = $script:ClientId
        agentVersion     = $AgentVersion
        hostname         = $env:COMPUTERNAME
        ip               = Get-LocalIP
        os               = Get-OSInfo
        osType           = "windows"
        cpu              = Get-CpuUsage
        ram              = Get-RamUsage
        disk             = Get-DiskUsage
        ramDetail        = Get-RamDetail
        diskDetail       = Get-DiskDetail
        uptime           = Get-Uptime
        bootTime         = Get-BootTime
        loadAvg          = Get-LoadAvg
        packagesPending  = Get-PendingUpdates
        runningApps      = Get-RunningApps
        topProcesses     = Get-TopProcesses
        loggedUsers      = Get-LoggedUsers
        networkInfo      = Get-NetworkInfo
        servicesStatus   = Get-ServicesStatus
        timestamp        = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
    }
}

function Send-Heartbeat {
    param([hashtable]$Metrics)
    if (-not $script:ClientId) { return $null }
    try {
        $body = $Metrics | ConvertTo-Json -Compress
        $resp = Invoke-RestMethod -Uri "$($script:ServerUrl)/api/agent/heartbeat" `
            -Method POST -Body $body -ContentType "application/json" `
            -Headers @{ "X-Agent-Token" = $script:AgentToken } -TimeoutSec 15
        return $resp
    } catch {
        Write-Log "Heartbeat gagal: $_" "WARN"
        return $null
    }
}

function Register-Client {
    if ($script:ClientId) { return }
    try {
        $ip   = Get-LocalIP
        $body = @{
            hostname     = $env:COMPUTERNAME
            ip           = $ip
            os           = Get-OSInfo
            agentVersion = $AgentVersion
            osType       = "windows"
            vnc_password = $script:VncPassword
            vnc_port     = 5901
        } | ConvertTo-Json -Compress

        $resp = Invoke-RestMethod -Uri "$($script:ServerUrl)/api/agent/register" `
            -Method POST -Body $body -ContentType "application/json" `
            -Headers @{ "X-Agent-Token" = $script:AgentToken } -TimeoutSec 15

        if ($resp.clientId) {
            $script:ClientId = $resp.clientId
            "RS_SERVER=$($script:ServerUrl)`nRS_CLIENT_ID=$($resp.clientId)`nRS_AGENT_TOKEN=$($script:AgentToken)`nRS_VNC_PASSWORD=$($script:VncPassword)" |
                Out-File -FilePath $ConfigFile -Encoding UTF8
            Write-Log "Terdaftar! Client ID: $($resp.clientId)"
        }
    } catch {
        Write-Log "Registrasi gagal: $_" "WARN"
    }
}

function Run-WindowsUpdate {
    Write-Log "Menjalankan Windows Update..."
    try {
        $session   = New-Object -ComObject Microsoft.Update.Session
        $searcher  = $session.CreateUpdateSearcher()
        $result    = $searcher.Search("IsInstalled=0 AND Type='Software'")
        if ($result.Updates.Count -eq 0) { Write-Log "Tidak ada update tersedia"; return }
        $dl = $session.CreateUpdateDownloader()
        $dl.Updates = $result.Updates; $dl.Download()
        $inst = $session.CreateUpdateInstaller()
        $inst.Updates = $result.Updates
        $ir = $inst.Install()
        Write-Log "Update selesai: $($result.Updates.Count) updates, ResultCode: $($ir.ResultCode)"
    } catch { Write-Log "Windows Update error: $_" "ERROR" }
}

# function Install-AgentService {
#     Write-Log "Menginstall RSMP-IT Agent sebagai Windows Service..."
#     New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null

#     # Copy script ke agent dir
#     Copy-Item $MyInvocation.MyCommand.Path "$AgentDir\rs-agent.ps1" -Force

#     # Download NSSM jika belum ada
#     $nssmPath = "$AgentDir\nssm.exe"
#     if (-not (Test-Path $nssmPath)) {
#         Write-Log "Download NSSM..."
#         try {
#             Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" `
#                 -OutFile "$AgentDir\nssm.zip" -UseBasicParsing -TimeoutSec 60
#             Expand-Archive "$AgentDir\nssm.zip" -DestinationPath "$AgentDir\nssm-tmp" -Force
#             Copy-Item "$AgentDir\nssm-tmp\nssm-2.24\win64\nssm.exe" $nssmPath
#             Remove-Item "$AgentDir\nssm-tmp", "$AgentDir\nssm.zip" -Recurse -Force
#             Write-Log "NSSM downloaded"
#         } catch {
#             Write-Log "NSSM download gagal, coba metode alternatif: $_" "WARN"
#             # Fallback: buat scheduled task
#             $action  = New-ScheduledTaskAction -Execute "powershell.exe" `
#                 -Argument "-ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden -File `"$AgentDir\rs-agent.ps1`" -ServerUrl `"$ServerUrl`""
#             $trigger = New-ScheduledTaskTrigger -AtStartup
#             $settings = New-ScheduledTaskSettingsSet -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1)
#             Register-ScheduledTask -TaskName "RSMPAgent" -Action $action `
#                 -Trigger $trigger -Settings $settings -RunLevel Highest -Force | Out-Null
#             Start-ScheduledTask -TaskName "RSMPAgent"
#             Write-Log "Agent diinstall sebagai Scheduled Task (fallback)"
#             return
#         }
#     }

#     # Install sebagai service via NSSM
#     $svcName = "RSMPAgent"
#     & $nssmPath stop $svcName 2>$null
#     & $nssmPath remove $svcName confirm 2>$null
#     & $nssmPath install $svcName "powershell.exe"
#     & $nssmPath set $svcName AppParameters "-ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden -File `"$AgentDir\rs-agent.ps1`" -ServerUrl `"$ServerUrl`""
#     & $nssmPath set $svcName DisplayName "RSMP-IT Agent Service"
#     & $nssmPath set $svcName Description "RSMP Hospital IT Management Agent v3.0"
#     & $nssmPath set $svcName Start SERVICE_AUTO_START
#     & $nssmPath set $svcName AppStdout "$LogFile"
#     & $nssmPath set $svcName AppStderr "$LogFile"
#     & $nssmPath set $svcName AppRotateFiles 1
#     & $nssmPath set $svcName AppRotateBytes 5000000
#     Start-Service $svcName
#     Write-Log "Service $svcName installed dan berjalan"

#     # Enable RDP
#     Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' `
#         -Name "fDenyTSConnections" -Value 0
#     Enable-NetFirewallRule -DisplayGroup "Remote Desktop" -ErrorAction SilentlyContinue
#     Write-Log "RDP enabled"

#     # Enable WinRM
#     Enable-PSRemoting -Force -SkipNetworkProfileCheck -ErrorAction SilentlyContinue
#     Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force -ErrorAction SilentlyContinue
#     Write-Log "WinRM enabled"

#     Write-Log "Instalasi selesai!"
#     Write-Log "URL Server: $ServerUrl"
#     Write-Log "Log: $LogFile"
# }

function Install-AgentService {
    Write-Log "Menginstall RSMP-IT Agent sebagai Windows Service..."
    New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null

    # PERBAIKAN: Copy script dengan cara yang benar
    $scriptPath = $PSCommandPath
    if (-not $scriptPath) {
        $scriptPath = "$AgentDir\rs-agent.ps1"
        Write-Log "Menggunakan path default: $scriptPath" "WARN"
    }
    
    $destPath = "$AgentDir\rs-agent.ps1"
    if (Test-Path $scriptPath) {
        if ((Resolve-Path $scriptPath).Path -eq (Resolve-Path -LiteralPath $destPath -ErrorAction SilentlyContinue).Path) {
            Write-Log "Script sudah di lokasi tujuan, skip copy"
        } else {
            Copy-Item $scriptPath $destPath -Force
            Write-Log "Script berhasil di-copy"
        }
    } else {
        Write-Log "Script source tidak ditemukan, membuat file baru..." "WARN"
        # Buat file baru dengan konten dari variabel
        $content = Get-Content $MyInvocation.MyCommand.ScriptBlock.ToString()
        $content | Out-File "$AgentDir\rs-agent.ps1" -Encoding UTF8
    }

    # PERBAIKAN: Gunakan sumber NSSM alternatif
    $nssmPath = "$AgentDir\nssm.exe"
    if (-not (Test-Path $nssmPath)) {
        Write-Log "Download NSSM dari sumber alternatif..."
        $nssmUrls = @(
            "https://www.nssm.cc/release/nssm-2.24.zip",
            "https://sourceforge.net/projects/nssm/files/nssm-2.24.zip/download"
        )
        
        $downloaded = $false
        foreach ($url in $nssmUrls) {
            try {
                Write-Log "Mencoba: $url"
                Invoke-WebRequest -Uri $url -OutFile "$AgentDir\nssm.zip" -UseBasicParsing -TimeoutSec 30
                $downloaded = $true
                break
            } catch {
                Write-Log "Gagal: $_" "WARN"
            }
        }
        
        if ($downloaded) {
            Expand-Archive "$AgentDir\nssm.zip" -DestinationPath "$AgentDir\nssm-tmp" -Force
            $nssmExe = Get-ChildItem "$AgentDir\nssm-tmp" -Filter "nssm.exe" -Recurse | Select-Object -First 1
            if ($nssmExe) {
                Copy-Item $nssmExe.FullName $nssmPath -Force
                Write-Log "NSSM berhasil diinstall"
            }
            Remove-Item "$AgentDir\nssm-tmp", "$AgentDir\nssm.zip" -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    # Cek NSSM dan install service
    if (Test-Path $nssmPath) {
        $svcName = "RSMPAgent"
        & $nssmPath stop $svcName 2>$null
        & $nssmPath remove $svcName confirm 2>$null
        & $nssmPath install $svcName "powershell.exe"
        & $nssmPath set $svcName AppParameters "-ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden -File `"$AgentDir\rs-agent.ps1`" -ServerUrl `"$ServerUrl`" -AgentToken `"$AgentToken`""
        & $nssmPath set $svcName DisplayName "RSMP-IT Agent Service"
        & $nssmPath set $svcName Description "RSMP Hospital IT Management Agent v3.0"
        & $nssmPath set $svcName Start SERVICE_AUTO_START
        & $nssmPath set $svcName AppStdout "$LogFile"
        & $nssmPath set $svcName AppStderr "$LogFile"
        Start-Service $svcName -ErrorAction SilentlyContinue
        Write-Log "Service $svcName installed"
    } else {
        # Fallback ke Scheduled Task -- NSSM gagal didownload (situs down/network),
        # bukan berarti degraded: task ini AtStartup + auto-restart, sama persistennya
        # dengan Windows Service untuk kebutuhan agent ini.
        Write-Log "NSSM tidak tersedia, pakai Scheduled Task (AtStartup + auto-restart, sama persisten)"
        $action = New-ScheduledTaskAction -Execute "powershell.exe" `
            -Argument "-ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden -File `"$AgentDir\rs-agent.ps1`" -ServerUrl `"$ServerUrl`" -AgentToken `"$AgentToken`""
        $trigger = New-ScheduledTaskTrigger -AtStartup
        $settings = New-ScheduledTaskSettingsSet -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1)
        Register-ScheduledTask -TaskName "RSMPAgent" -Action $action `
            -Trigger $trigger -Settings $settings -RunLevel Highest -Force | Out-Null
        Start-ScheduledTask -TaskName "RSMPAgent"
        Write-Log "Agent berjalan sebagai Scheduled Task"
    }
}

function Install-VNCServer {
    # Pasang TightVNC (service, port 5901, share console desktop) -- remote via
    # VNC seperti Linux. Password ikut setting platform (Settings > Password VNC Default).
    $VncPass = $script:VncPassword
    $tvnc = "C:\Program Files\TightVNC\tvnserver.exe"
    if (-not (Test-Path $tvnc)) {
        Write-Log "Download & install TightVNC (silent)..."
        $msi  = "$AgentDir\tightvnc.msi"
        $urls = @(
            "https://www.tightvnc.com/download/2.8.85/tightvnc-2.8.85-gpl-setup-64bit.msi",
            "https://www.tightvnc.com/download/2.8.81/tightvnc-2.8.81-gpl-setup-64bit.msi"
        )
        $got = $false
        foreach ($u in $urls) {
            try { Invoke-WebRequest -Uri $u -OutFile $msi -UseBasicParsing -TimeoutSec 90; $got = $true; break }
            catch { Write-Log "Download TightVNC gagal: $u" "WARN" }
        }
        if (-not $got) { Write-Log "TightVNC tak bisa didownload, VNC dilewati" "WARN"; return }
        $pw = $VncPass.Substring(0, [Math]::Min(8, $VncPass.Length))
        $msiArgs = @(
            "/i", "`"$msi`"", "/quiet", "/norestart",
            "ADDLOCAL=Server", "SERVER_REGISTER_AS_SERVICE=1", "SERVER_ADD_FIREWALL_EXCEPTION=1",
            "SET_USEVNCAUTHENTICATION=1", "VALUE_OF_USEVNCAUTHENTICATION=1",
            "SET_PASSWORD=1", "VALUE_OF_PASSWORD=$pw",
            "SET_RFBPORT=1", "VALUE_OF_RFBPORT=5901",
            "SET_ACCEPTHTTPCONNECTIONS=1", "VALUE_OF_ACCEPTHTTPCONNECTIONS=0"
        )
        Start-Process msiexec.exe -ArgumentList $msiArgs -Wait
        Remove-Item $msi -Force -ErrorAction SilentlyContinue
        Write-Log "TightVNC terpasang (port 5901)"
    }
    # Pastikan port + password benar & service jalan.
    reg add "HKLM\SOFTWARE\TightVNC\Server" /v RfbPort /t REG_DWORD /d 5901 /f 2>$null | Out-Null
    reg add "HKLM\SOFTWARE\TightVNC\Server" /v UseVncAuthentication /t REG_DWORD /d 1 /f 2>$null | Out-Null
    Restart-Service tvnserver -ErrorAction SilentlyContinue
    netsh advfirewall firewall delete rule name="RSMP-IT VNC" 2>$null | Out-Null
    netsh advfirewall firewall add rule name="RSMP-IT VNC" dir=in action=allow protocol=TCP localport=5901 2>$null | Out-Null
    Write-Log "VNC firewall (5901) & service siap"
}

function Uninstall-AgentService {
    $nssmPath = "$AgentDir\nssm.exe"
    if (Test-Path $nssmPath) {
        & $nssmPath stop RSMPAgent 2>$null
        & $nssmPath remove RSMPAgent confirm 2>$null
    }
    Unregister-ScheduledTask -TaskName "RSMPAgent" -Confirm:$false -ErrorAction SilentlyContinue
    # Uninstall TightVNC (best-effort)
    $u = Get-ChildItem "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" -ErrorAction SilentlyContinue |
        ForEach-Object { Get-ItemProperty $_.PSPath } |
        Where-Object { $_.DisplayName -like "TightVNC*" } | Select-Object -First 1
    if ($u -and $u.PSChildName) {
        Start-Process msiexec.exe -ArgumentList "/x $($u.PSChildName) /quiet /norestart" -Wait -ErrorAction SilentlyContinue
    }
    netsh advfirewall firewall delete rule name="RSMP-IT VNC" 2>$null | Out-Null
    Write-Log "Agent + TightVNC diuninstall"
}

# ── Main ────────────────────────────────────────────────────

# Buat direktori
New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null

# Load config
if (Test-Path $ConfigFile) {
    Get-Content $ConfigFile | ForEach-Object {
        if ($_ -match '^RS_CLIENT_ID=(.+)')      { $script:ClientId     = $Matches[1].Trim() }
        if ($_ -match '^RS_SERVER=(.+)')         { $script:ServerUrl    = $Matches[1].Trim() }
        if ($_ -match '^RS_AGENT_TOKEN=(.+)')    { $script:AgentToken   = $Matches[1].Trim() }
        if ($_ -match '^RS_VNC_PASSWORD=(.+)')   { $script:VncPassword  = $Matches[1].Trim() }
    }
}
if ($ClientId)     { $script:ClientId    = $ClientId }
if ($ServerUrl)    { $script:ServerUrl   = $ServerUrl }
if ($AgentToken)   { $script:AgentToken  = $AgentToken }
if ($VncPassword)  { $script:VncPassword = $VncPassword }
# Belum pernah di-set (install pertama tanpa -VncPassword) -- default sama dgn Linux.
if (-not $script:VncPassword) { $script:VncPassword = "Rsmp@2026" }

if ($Install) {
    # Simpan sekarang -- service/scheduled task jalan tanpa -VncPassword arg,
    # jadi run berikutnya baca balik dari config file ini, bukan dari param.
    "RS_SERVER=$($script:ServerUrl)`nRS_AGENT_TOKEN=$($script:AgentToken)`nRS_VNC_PASSWORD=$($script:VncPassword)" |
        Out-File -FilePath $ConfigFile -Encoding UTF8
    Install-AgentService; Install-VNCServer; exit
}
if ($Uninstall) { Uninstall-AgentService; exit }

# ── Agent Loop ──────────────────────────────────────────────

Write-Log "RSMP-IT Agent v$AgentVersion dimulai (Windows)"
Write-Log "Server: $($script:ServerUrl)"
Write-Log "Client ID: $(if ($script:ClientId) { $script:ClientId } else { 'Belum terdaftar' })"

Register-Client

$errors   = 0
$iteration = 0
$installedAppsCached = ""

while ($true) {
    try {
        $iteration++
        $metrics = Collect-Metrics

        # Installed apps setiap 10 menit
        if ($iteration % 10 -eq 1) {
            $installedAppsCached = Get-InstalledApps
        }
        $metrics['installedApps'] = $installedAppsCached

        $response = Send-Heartbeat -Metrics $metrics
        $errors   = 0

        if ($response -and $response.command) {
            $cmd = $response.command
            Write-Log "Perintah: $($cmd.ToString().Substring(0, [Math]::Min(60, $cmd.ToString().Length)))"
            if ($cmd -eq 'update') { Run-WindowsUpdate }
            elseif ($cmd -eq 'restart-agent') { Restart-Service RSMPAgent -ErrorAction SilentlyContinue }
        }

    } catch {
        $errors++
        if ($errors % 5 -eq 1) { Write-Log "Error loop #${errors}: $_" "WARN" }
        if ($errors -ge 30) {
            Write-Log "Banyak error, coba register ulang..." "WARN"
            $script:ClientId = ""
            Register-Client
            $errors = 0
        }
    }

    Start-Sleep -Seconds $Interval
}
