@echo off
rem Desliga a sincronizacao automatica do CRM.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Unregister-ScheduledTask -TaskName 'CRM NovoSeminovo - sincronizar' -Confirm:$false; Write-Host 'Sincronizacao automatica desligada.'"
pause
