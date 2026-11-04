@echo off
rem Sincroniza o CRM com o site e atualiza avisos e painel.
rem Roda sozinho todo dia (agendado por agendar-sincronizacao.cmd).
cd /d "%~dp0"
if not exist relatorios mkdir relatorios
echo ==== %date% %time% ==== >> relatorios\sincronizacao.log
node scripts\sincronizar.mjs >> relatorios\sincronizacao.log 2>&1
