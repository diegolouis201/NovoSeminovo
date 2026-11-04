@echo off
rem Busca as ordens do CRM para o Marketing (roda sozinho as 07:30).
cd /d "%~dp0"
if not exist ordens-crm mkdir ordens-crm
echo ==== %date% %time% ==== >> ordens-crm\busca.log
node scripts\buscar-ordens.mjs >> ordens-crm\busca.log 2>&1
