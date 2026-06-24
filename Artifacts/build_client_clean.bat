@echo off

set basepath=%~dp0
echo %basepath%
cd %basepath%

mkdir ..\build_client\Client
mkdir ..\build_client\Client\public
mkdir ..\build_client\Client\src
mkdir ..\build_client\Client\src\common
mkdir ..\build_client\Client\src\modules
mkdir ..\build_client\Client\src\dialogs
mkdir ..\build_client\Client\dist

copy ..\Client\public\*.* ..\build_client\Client\public
copy ..\Client\src\*.* ..\build_client\Client\src
copy ..\Client\src\common\*.* ..\build_client\Client\src\common
copy ..\Client\src\modules\*.* ..\build_client\Client\src\modules
copy ..\Client\src\dialogs\*.* ..\build_client\Client\src\dialogs
copy ..\Client\*.js ..\build_client\Client
copy ..\Client\*.json ..\build_client\Client

cd ..
git log -n 1 --format="%%H" -- "Client" >"build_client\Client\dist\_githash_client.txt"
git log -n 1 --format="%%H" -- "Client" >"Artifacts\clientdist\_githash_client.txt"
SET /p CLIENTDIRHASH=<"build_client\Client\dist\_githash_client.txt"


echo export function getClientGitHash ()> build_client\Client\src\AMCGitHash.js
echo {>> build_client\Client\src\AMCGitHash.js
echo   return "%CLIENTDIRHASH%";>> build_client\Client\src\AMCGitHash.js
echo }>> build_client\Client\src\AMCGitHash.js

cd build_client\Client

set TOOLBUILDDIR=..\..\build_clientdist_tools
if not exist "%TOOLBUILDDIR%" (mkdir "%TOOLBUILDDIR%")
if exist "%TOOLBUILDDIR%\CMakeCache.txt" del /f /q "%TOOLBUILDDIR%\CMakeCache.txt"
if exist "%TOOLBUILDDIR%\CMakeFiles" rmdir /s /q "%TOOLBUILDDIR%\CMakeFiles"
git rev-parse --verify --short HEAD >"%TOOLBUILDDIR%\githash.txt"
git log -n 1 --format="%%H" -- "Client" >"%TOOLBUILDDIR%\clientdirhash.txt"
cmake -S ..\.. -B "%TOOLBUILDDIR%" -G "Visual Studio 17 2022" -A x64
if errorlevel 1 goto :error
cmake --build "%TOOLBUILDDIR%" --target create_client_dist --config Release
if errorlevel 1 goto :error
cmake --build "%TOOLBUILDDIR%" --target create_client_source --config Release
if errorlevel 1 goto :error

call npm install
if errorlevel 1 goto :error
call npm run build
if errorlevel 1 goto :error

cd ..\..\



cd build_client\Client

"%TOOLBUILDDIR%\DevPackage\Framework\create_client_dist.exe" dist ..\..\Artifacts\clientdist\clientpackage.zip 

"%TOOLBUILDDIR%\DevPackage\Framework\create_client_source.exe" . ..\..\Artifacts\clientdist\clientsourcepackage.zip 

if "%1" neq "NOPAUSE" (
	pause
)

exit 0

:error
echo.
echo build_client_clean.bat failed with exit code %errorlevel%.
if "%1" neq "NOPAUSE" (
	pause
)
exit /b %errorlevel%
