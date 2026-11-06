# Dauertest-Messung: protokolliert CPU und Arbeitsspeicher von ON AIR in eine CSV.
# Aufruf:  powershell -ExecutionPolicy Bypass -File scripts\soak-monitor.ps1 -Hours 8
param(
  [double]$Hours = 8,
  [int]$IntervalSeconds = 60,
  [string]$Out = "onair-soak-$(Get-Date -Format yyyyMMdd-HHmm).csv"
)
$end = (Get-Date).AddHours($Hours)
"time,cpu_percent,working_set_mb,private_mb,handles,threads" | Out-File -Encoding utf8 $Out
$cores = [Environment]::ProcessorCount
$prev = $null; $prevTime = $null
while ((Get-Date) -lt $end) {
  $p = Get-Process | Where-Object { $_.ProcessName -in @("ON AIR", "onair-desktop") } | Select-Object -First 1
  if ($p) {
    $now = Get-Date
    $cpu = ""
    if ($prev -ne $null) {
      $cpu = [math]::Round((($p.TotalProcessorTime - $prev).TotalSeconds / ($now - $prevTime).TotalSeconds) * 100 / $cores, 2)
    }
    $prev = $p.TotalProcessorTime; $prevTime = $now
    "{0},{1},{2},{3},{4},{5}" -f $now.ToString("s"), $cpu, [math]::Round($p.WorkingSet64/1MB,1), [math]::Round($p.PrivateMemorySize64/1MB,1), $p.HandleCount, $p.Threads.Count | Out-File -Append -Encoding utf8 $Out
  } else {
    "{0},,,,," -f (Get-Date).ToString("s") | Out-File -Append -Encoding utf8 $Out
  }
  Start-Sleep -Seconds $IntervalSeconds
}
Write-Host "Fertig: $Out"
