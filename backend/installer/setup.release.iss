#define AppName "Digital Signature Service"
#define AppVersion "1.0.0"
#define ServiceName "DigitalSignatureService"

[Setup]
AppId={{A5D0FC8C-E07E-4B17-81B2-0F6A5CC2A2D3}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={autopf}\Digital Signature Service
DefaultGroupName={#AppName}
OutputDir=output
OutputBaseFilename=Digital Signaure
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
DisableDirPage=no
DisableProgramGroupPage=yes

[Files]
Source: "payload\app\*"; DestDir: "{app}\app"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "payload\runtime\*"; DestDir: "{app}\runtime"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "payload\installer-actions\*"; DestDir: "{app}\installer-actions"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "payload\service-wrapper\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer-actions\install-service.ps1"" -InstallRoot ""{app}"""; StatusMsg: "Installing and starting backend service..."; Flags: waituntilterminated

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer-actions\uninstall-service.ps1"""; Flags: runhidden waituntilterminated

[Icons]
Name: "{autoprograms}\Digital Signature Service Status"; Filename: "{cmd}"; Parameters: "/k sc query {#ServiceName}"
