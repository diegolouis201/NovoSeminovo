@echo off
rem Liga a busca automatica das ordens do CRM todo dia as 07:30.
rem Se o computador estiver desligado nesse horario, roda assim que ligar.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=(Get-Location).Path; Register-ScheduledTask -TaskName 'Marketing NovoSeminovo - ordens do CRM' -Action (New-ScheduledTaskAction -Execute ($p+'\buscar-ordens.cmd') -WorkingDirectory $p) -Trigger (New-ScheduledTaskTrigger -Daily -At '07:30') -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable) -Force | Out-Null; Write-Host 'Pronto: o Marketing vai buscar as ordens do CRM todo dia as 07:30.'"
echo.
echo Para testar agora, de dois cliques em buscar-ordens.cmd e abra ordens-crm\ordens-do-dia.md
pause
