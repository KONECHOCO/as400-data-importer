# Changelog

## 2.0.0 Pro - 2026-05-30

- Created the AS400 Data Importer Pro variant with its own app name, package name, installer name, and Windows app directory.
- Switched public product links and license verification defaults to `as400pro.ikonetsolutions.com`.
- Separated the Pro local database and credential encryption namespace from the standard edition.
- Made Pro email sender, public site, support email, download URL, and setup filename configurable by environment variables.

## 1.0.4 - 2026-05-30

- Improved dashboard responsiveness for narrow windows.
- Changed the sidebar to an icon rail on small viewports so dashboard cards no longer overlap.

## 1.0.3 - 2026-05-28

- Added ESLint configuration and cleaned the frontend so lint passes.
- Made JWT secret and CORS origins configurable through environment variables.
- Namespaced saved app settings by user and scoped database statistics to the current user.
- Added admin route protection in the frontend.
- Added stricter password validation and case-insensitive login email lookup.

## 1.0.2 - 2026-05-28

- Added the missing Vite `index.html` entrypoint so the frontend runs at `/`.
- Added PostCSS configuration so Tailwind CSS is compiled correctly.
- Added `package-lock.json` for reproducible frontend installs.

## 1.0.1 - 2026-05-28

- Fixed AS/400 JDBC connections so the configured port is included in the JDBC URL.
- Added a clear error when `jt400.jar` is missing or `AS400_JT400_JAR` points to an invalid file.
- Added tests for JDBC URL generation.

## 1.0.0 - 2026-05-28

- Initial open source release.
