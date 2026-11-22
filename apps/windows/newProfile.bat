
@echo off
setlocal EnableDelayedExpansion

set "BASE=%~dp0ChromeProfiles"
set "EXT=%~dp0extension"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"

if not exist "%CHROME%" (
    set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
)

if not exist "%CHROME%" (
    echo Chrome bulunamadi!
    pause
    exit /b
)

if not exist "%EXT%\manifest.json" (
    echo Eklenti klasoru bulunamadi: %EXT%
    pause
    exit /b
)

if not exist "%BASE%" mkdir "%BASE%"

set /a N=1

:find
set "NUM=00000!N!"
set "NUM=!NUM:~-5!"
set "PROFILE=%BASE%\profile_!NUM!"

if exist "!PROFILE!" (
    set /a N+=1
    goto find
)

mkdir "!PROFILE!"

echo Yeni profil olusturuldu: profile_!NUM!
start "" "%CHROME%" --user-data-dir="!PROFILE!" --load-extension="%EXT%" --disable-features=DisableLoadExtensionCommandLineSwitch --no-first-run --disable-gpu --disable-gpu-compositing

endlocal
