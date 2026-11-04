@echo off
rem Liga a sincronizacao automatica do CRM todo dia as 07:30.
rem Se o computador estiver desligado nesse horario, roda assim que ligar.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=(Get-Location).Path; Register-ScheduledTask -TaskName 'CRM NovoSeminovo - sincronizar' -Action (New-ScheduledTaskAction -Execute ($p+'\sincronizar.cmd') -WorkingDirectory $p) -Trigger (New-ScheduledTaskTrigger -Daily -At '07:30') -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable) -Force | Out-Null; Write-Host 'Pronto: o CRM vai sincronizar sozinho todo dia as 07:30.'"
echo.
echo Para testar agora, de dois cliques em sincronizar.cmd e depois abra relatorios\painel.html
pause
