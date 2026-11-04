@echo off
rem Atalho do CRM: sincroniza com o site e abre o painel.
call "%~dp0sincronizar.cmd"
start "" "%~dp0relatorios\painel.html"
