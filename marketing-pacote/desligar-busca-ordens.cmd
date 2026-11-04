@echo off
rem Desliga a busca automatica das ordens do CRM.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Unregister-ScheduledTask -TaskName 'Marketing NovoSeminovo - ordens do CRM' -Confirm:$false; Write-Host 'Busca automatica desligada.'"
pause
