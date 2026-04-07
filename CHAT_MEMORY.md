# DSC-in-Node Chat Memory

## Current Architecture

- Backend helper is an Express service under backend/src.
- Frontend is Angular under frontend/src.
- Current helper routes are:
  - POST /api/sign
  - POST /api/verify

## Port Configuration

- Helper backend .env currently has:
  - PKCS11_LIBRARY_PATH_WINDOWS=C:\\Windows\\System32\\eps2003csp11v2.dll
  - PORT=45763
- Frontend API base URL was updated to match helper port:
  - frontend/src/app/services/dsc.service.ts uses http://localhost:45763/api

## Functional Changes Done

- Removed immediate auto-verification after signing from signer UI.
- Sign page now signs PDF and shows download only.
- Verify remains on dedicated verify page.

## Error Handling Improvements

- Helper now returns explicit hardware-related errors instead of generic ones:
  - TOKEN_NOT_INSERTED
  - PKCS11_DRIVER_MISSING
- Frontend parses backend error payloads (including Blob error payloads) and shows user-friendly messages.

## Cleanup Done

- Removed unused backend code and legacy route flow.
- Kept only two active helper routes: /sign and /verify.
- Removed unused imports and dead frontend helper methods/styles.
- Removed empty backend/src/types directory.

## Installer and Scripts Status

- Installer setup script cleaned to run install/uninstall actions in elevated setup context.
- build-installer.ps1 now deletes stale DSCBackendSetup.exe before a new build.
- Fresh installer build completed successfully.
- Latest installer output path:
  - backend/installer/output/DSCBackendSetup.exe

## Important Integration Note

- Recommended production flow is Angular -> Nest -> Helper (not Angular -> Helper directly).
- Nest should forward multipart PDF + PIN to helper and return signed PDF to Angular.

## Open Items

- Terminal context currently shows npm run start/dev exiting with code 1, but latest code diagnostics were clean.
- If Nest integration is required next, implement proxy endpoints in Nest and repoint frontend to Nest API URL.
