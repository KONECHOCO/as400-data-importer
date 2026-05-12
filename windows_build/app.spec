# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec — AS400 Data Importer
Run from the project root:
    pyinstaller windows_build\\app.spec
"""
import os
import sys
from PyInstaller.utils.hooks import collect_all, collect_submodules, collect_data_files

block_cipher = None

# SPECPATH = directory contenente questo file spec (es. .../windows_build)
# PROJECT_ROOT = directory padre (es. .../AS400Importer-WindowsBuild)
SPEC_DIR     = os.path.abspath(SPECPATH)        # .../windows_build
PROJECT_ROOT = os.path.dirname(SPEC_DIR)        # .../AS400Importer-WindowsBuild

# ── Collect hidden imports + datas for tricky packages ───────────────────────
datas         = []
binaries       = []
hiddenimports  = []

for pkg in ['uvicorn', 'fastapi', 'starlette', 'pydantic', 'pydantic_core',
            'anyio', 'h11', 'httptools', 'watchfiles', 'websockets',
            'chardet', 'passlib', 'pystray', 'PIL', 'webview']:
    try:
        d, b, h = collect_all(pkg)
        datas        += d
        binaries     += b
        hiddenimports += h
    except Exception:
        pass

# explicit hidden imports that PyInstaller often misses
hiddenimports += [
    # uvicorn internals
    'uvicorn.logging', 'uvicorn.loops', 'uvicorn.loops.auto',
    'uvicorn.protocols', 'uvicorn.protocols.http', 'uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl', 'uvicorn.protocols.http.httptools_impl',
    'uvicorn.protocols.websockets', 'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan', 'uvicorn.lifespan.on', 'uvicorn.lifespan.off',
    # fastapi / starlette
    'fastapi.responses', 'fastapi.staticfiles', 'fastapi.middleware.cors',
    'starlette.routing', 'starlette.staticfiles', 'starlette.responses',
    'starlette.middleware.cors',
    # auth / crypto
    'jose', 'jose.jwt', 'jose.exceptions',
    'passlib', 'passlib.context',
    'passlib.handlers', 'passlib.handlers.bcrypt', 'passlib.handlers.sha2_crypt',
    'passlib.handlers.md5_crypt', 'passlib.handlers.sha1_crypt',
    'passlib.handlers.des_crypt', 'passlib.handlers.digests',
    'passlib.handlers.django', 'passlib.handlers.ldap_digests',
    'passlib.handlers.misc', 'passlib.handlers.pbkdf2',
    'passlib.handlers.scrypt', 'passlib.handlers.argon2',
    'passlib.utils', 'passlib.utils.binary', 'passlib.utils.decor',
    'passlib.crypto', 'passlib.crypto.digest', 'passlib.crypto._md4',
    'cryptography', 'cryptography.fernet',
    'cryptography.hazmat.primitives', 'cryptography.hazmat.backends',
    'cryptography.hazmat.backends.openssl.backend',
    # AS400 / Java bridge
    'jaydebeapi', 'jpype', 'jpype._jvmfinder',
    'jpype._core', 'jpype._jclass', 'jpype.imports',
    # data
    'pandas', 'pandas.io.formats.excel',
    'numpy', 'numpy.core', 'numpy.core._multiarray_umath',
    'openpyxl', 'openpyxl.styles', 'openpyxl.utils',
    'xlrd', 'xlwt',
    'chardet',
    'reportlab', 'reportlab.pdfgen', 'reportlab.pdfgen.canvas',
    'reportlab.lib', 'reportlab.lib.colors', 'reportlab.lib.pagesizes',
    'reportlab.lib.units', 'reportlab.platypus',
    # http / multipart
    'multipart', 'python_multipart',
    # email (stdlib — mantenuto per compatibilità)
    'email', 'email.mime', 'email.mime.text', 'email.mime.multipart',
    # requests (license verification + SendGrid API)
    'requests', 'urllib3', 'certifi', 'charset_normalizer',
    # modulo email interno
    'backend.email_service',
    # system tray
    'pystray', 'pystray._win32', 'pystray._base',
    'PIL', 'PIL.Image', 'PIL.ImageDraw', 'PIL.ImageFont',
    # pywebview (finestra desktop nativa)
    'webview', 'webview.platforms', 'webview.platforms.winforms',
    'webview.platforms.edgechromium', 'webview.guilib',
    'clr', 'clr_loader',
    # stdlib extras
    'sqlite3', 'uuid', 'hashlib', 'threading', 'webbrowser',
    'socket', 'json', 'csv', 'io', 're', 'winreg',
    # tkinter (used by save_file dialog)
    'tkinter', 'tkinter.filedialog', 'tkinter.messagebox',
    '_tkinter',
]

# ── Data files to bundle ──────────────────────────────────────────────────────
datas += [
    # React build output (served as static files)
    (os.path.join(PROJECT_ROOT, 'dist'), 'dist'),
    # JT400 JDBC driver
    (os.path.join(PROJECT_ROOT, 'backend', 'lib', 'jt400.jar'), 'lib'),
    # Backend Python package (needed as data for frozen imports)
    (os.path.join(PROJECT_ROOT, 'backend'), 'backend'),
]

# Collect pandas / numpy data files (timezone data etc.)
datas += collect_data_files('pandas')
datas += collect_data_files('numpy')

a = Analysis(
    [os.path.join(PROJECT_ROOT, 'run.py')],
    pathex=[PROJECT_ROOT],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['matplotlib', 'scipy', 'IPython', 'notebook', 'pytest'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='AS400Importer',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,           # no console window — uses system tray
    icon=os.path.join(SPEC_DIR, 'AS400Importer.ico'),
    version=os.path.join(SPEC_DIR, 'version_info.txt'),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='AS400Importer',    # output folder: dist_windows/AS400Importer/
)
