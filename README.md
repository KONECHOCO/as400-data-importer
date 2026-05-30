# AS400 Data Importer Pro

<p align="center">
  <img src="https://as400pro.ikonetsolutions.com/logo.png" alt="Ikonet Solutions" width="80"/>
</p>

<p align="center">
  <strong>Desktop application for IBM AS/400 (IBM i) data import and export</strong><br/>
  Built with React + Vite · Python FastAPI · pywebview · JT400 JDBC
</p>

<p align="center">
  <a href="https://as400pro.ikonetsolutions.com"><img src="https://img.shields.io/badge/website-as400pro.ikonetsolutions.com-blue" alt="Website"/></a>
  <img src="https://img.shields.io/badge/platform-Windows%2010%2F11-lightgrey" alt="Platform"/>
  <img src="https://img.shields.io/badge/python-3.11%2B-yellow" alt="Python"/>
  <img src="https://img.shields.io/badge/react-19-61dafb" alt="React"/>
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License"/>
</p>

---

## ✨ Features

- 🔌 **Connect to AS/400** via JDBC (JT400 driver) — hostname, port, library
- 📥 **Import data** from Excel (.xlsx, .xls), CSV, TSV, XML, JSON → AS/400 tables
- 📤 **Export data** with SQL queries → Excel, CSV, TSV, JSON, XML, PDF
- 🖥️ **Native Windows desktop app** using pywebview (WebView2)
- 📧 **Email notifications** on import/export completion (SendGrid)
- 🔐 **JWT authentication** with persistent sessions
- 📊 **Operation history** with full audit log
- ⚙️ **Column configurator** — rename, reorder, format columns before export

## 🖥️ Screenshots

| Dashboard | Export | Import |
|-----------|--------|--------|
| Connect to AS/400 and run queries | Export query results to any format | Import files directly into AS/400 tables |

## 🚀 Quick Start

### Prerequisites

- Windows 10 / 11 (64-bit)
- Java JRE 8+ (for AS/400 JDBC connection)
- Python 3.11+
- Node.js 18+

### Development Setup

```bash
# Clone the repository
git clone -b codex/pro-version https://github.com/KONECHOCO/as400-data-importer.git
cd as400-data-importer

# Install frontend dependencies
npm install

# Install backend dependencies
pip install -r requirements.txt

# Start development (frontend + backend)
npm run dev          # React frontend on http://localhost:5173
python run.py        # FastAPI backend on http://localhost:8000
```

### Build Windows Installer

```bash
# Build React frontend
npm run build

# Build PyInstaller executable
pyinstaller windows_build/app.spec --distpath dist_windows_new --noconfirm

# Build NSIS installer
makensis windows_build/installer.nsi
```

## 🏗️ Architecture

```
as400-data-importer/
├── src/                    # React frontend (Vite)
│   ├── pages/              # Export, Import, Dashboard, History...
│   ├── context/            # AuthContext (JWT + pywebview persistence)
│   └── services/           # Axios API client
├── backend/                # Python FastAPI backend
│   ├── main.py             # API endpoints
│   ├── database.py         # SQLite schema
│   ├── file_handler.py     # Excel/CSV/XML/PDF read-write
│   ├── email_service.py    # SendGrid email notifications
│   └── license_mgr.py      # License validation
├── windows_build/          # PyInstaller spec + NSIS installer script
└── run.py                  # Windows entry point (pywebview desktop app)
```

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TailwindCSS |
| Backend | Python FastAPI, uvicorn |
| Database | SQLite (local) |
| Desktop | pywebview (WebView2), pystray |
| AS/400 | JayDeBeApi + JT400 JDBC driver |
| Auth | JWT (python-jose) + bcrypt |
| Email | SendGrid API |
| Packaging | PyInstaller + NSIS |

## 📄 License

MIT License — Copyright © 2026 [Ikonet Solutions](https://as400pro.ikonetsolutions.com)

---

<p align="center">Made with ❤️ by <a href="https://as400pro.ikonetsolutions.com">Ikonet Solutions</a></p>
