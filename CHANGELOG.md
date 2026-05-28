# Changelog

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
