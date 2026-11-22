
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

if not exist "%BASE%" (
    echo Henuz profil olusturulmamis!
    pause
    exit /b
)

echo.
echo ===== CHROME PROFILLERI =====
echo.

for /d %%D in ("%BASE%\profile_*") do (
    echo %%~nxD
)

echo.
set /p "NUM=Acmak istediginiz profil numarasi: "

set "PAD=00000%NUM%"
set "PAD=%PAD:~-5%"
set "PROFILE=%BASE%\profile_%PAD%"

if not exist "%PROFILE%" (
    echo Profil bulunamadi!
    pause
    exit /b
)

echo.
echo Aciliyor: profile_%PAD%

start "" "%CHROME%" --user-data-dir="%PROFILE%" --load-extension="%EXT%" --disable-features=DisableLoadExtensionCommandLineSwitch --no-first-run --disable-gpu --disable-gpu-compositing

endlocal
