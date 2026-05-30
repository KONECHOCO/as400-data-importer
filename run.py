"""
AS400 Data Importer Pro — Windows entry point.
Bundled by PyInstaller into AS400ImporterPro.exe.
"""
import sys
import os
import socket
import threading
import time
import traceback
import pathlib
import base64

# ── Path resolution: frozen (PyInstaller) vs dev ──────────────────────────────
if getattr(sys, 'frozen', False):
    BASE_DIR   = os.path.dirname(sys.executable)
    BUNDLE_DIR = sys._MEIPASS
else:
    BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
    BUNDLE_DIR = BASE_DIR
    sys.path.insert(0, BASE_DIR)

# ── Writable data dir ─────────────────────────────────────────────────────────
APP_DIR  = os.path.join(
    os.environ.get('LOCALAPPDATA') or os.path.expanduser('~'),
    'AS400ImporterPro'
)
DATA_DIR = os.path.join(APP_DIR, 'data')
LOG_FILE = os.path.join(APP_DIR, 'error.log')
os.makedirs(DATA_DIR, exist_ok=True)

# Fix stdout/stderr None (console=False in PyInstaller)
if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w')

# Env vars per il backend
os.environ['AS400_DB_PATH']   = os.path.join(DATA_DIR, 'ikonet_pro.db')
os.environ['AS400_JT400_JAR'] = os.path.join(BUNDLE_DIR, 'lib', 'jt400.jar')
os.environ['AS400_DIST_DIR']  = os.path.join(BUNDLE_DIR, 'dist')

PORT = 8000
URL  = f'http://localhost:{PORT}'


def _find_java() -> bool:
    """
    Auto-rileva Java e imposta JAVA_HOME.
    Cerca nel registry Windows, poi nelle directory standard.
    """
    # Già impostato e valido
    jh = os.environ.get('JAVA_HOME', '')
    if jh and os.path.isfile(os.path.join(jh, 'bin', 'java.exe')):
        return True

    # Registry Windows
    try:
        import winreg
        reg_paths = [
            r'SOFTWARE\JavaSoft\JDK',
            r'SOFTWARE\JavaSoft\JRE',
            r'SOFTWARE\JavaSoft\Java Runtime Environment',
            r'SOFTWARE\JavaSoft\Java Development Kit',
            r'SOFTWARE\Eclipse Adoptium\JRE',
            r'SOFTWARE\Eclipse Adoptium\JDK',
            r'SOFTWARE\Microsoft\JDK',
            r'SOFTWARE\Amazon\Amazon Corretto',
        ]
        for reg_path in reg_paths:
            for hive in [winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER]:
                try:
                    key = winreg.OpenKey(hive, reg_path)
                    try:
                        ver = winreg.QueryValueEx(key, 'CurrentVersion')[0]
                        subkey = winreg.OpenKey(key, ver)
                    except Exception:
                        subkey = winreg.OpenKey(key, winreg.EnumKey(key, 0))
                    jh = winreg.QueryValueEx(subkey, 'JavaHome')[0]
                    if os.path.isfile(os.path.join(jh, 'bin', 'java.exe')):
                        os.environ['JAVA_HOME'] = jh
                        os.environ['PATH'] = (
                            os.path.join(jh, 'bin') + os.pathsep +
                            os.environ.get('PATH', '')
                        )
                        return True
                except Exception:
                    pass
    except ImportError:
        pass

    # Directory standard
    bases = [
        r'C:\Program Files\Java',
        r'C:\Program Files\Eclipse Adoptium',
        r'C:\Program Files\Microsoft',
        r'C:\Program Files\OpenJDK',
        r'C:\Program Files\BellSoft',
        r'C:\Program Files\Amazon Corretto',
        r'C:\Program Files\Zulu',
        r'C:\Program Files (x86)\Java',
    ]
    for base in bases:
        if not os.path.isdir(base):
            continue
        try:
            entries = sorted(os.listdir(base), reverse=True)  # versione più recente prima
        except Exception:
            continue
        for entry in entries:
            candidate = os.path.join(base, entry)
            if os.path.isfile(os.path.join(candidate, 'bin', 'java.exe')):
                os.environ['JAVA_HOME'] = candidate
                os.environ['PATH'] = (
                    os.path.join(candidate, 'bin') + os.pathsep +
                    os.environ.get('PATH', '')
                )
                return True

    return False


def _port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) != 0


def _show_error(msg: str):
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(
            0,
            f"AS400 Importer non si è avviato.\n\n{msg}\n\nLog: {LOG_FILE}",
            "Errore di avvio", 0x10
        )
    except Exception:
        pass


def _show_java_error():
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(
            0,
            "Java non trovato sul sistema.\n\n"
            "Per connettersi all'AS/400 è richiesto Java (JRE 8 o superiore).\n\n"
            "Scarica Java gratuito da:\nhttps://adoptium.net/\n\n"
            "Dopo l'installazione, riavvia l'applicazione.",
            "Java richiesto", 0x30  # icona warning
        )
    except Exception:
        pass


def _start_server():
    try:
        import uvicorn
        from backend.main import app
        uvicorn.run(app, host='127.0.0.1', port=PORT, log_level='warning')
    except Exception:
        err = traceback.format_exc()
        try:
            os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
            with open(LOG_FILE, 'w', encoding='utf-8') as f:
                f.write(err)
        except Exception:
            pass
        _show_error(err[:2000])


def _wait_server(timeout: int = 20) -> bool:
    for _ in range(timeout * 2):
        if not _port_free(PORT):
            return True
        time.sleep(0.5)
    return False


# ── PyWebview Python API (esposta a JavaScript) ───────────────────────────────
class AppApi:
    """Metodi chiamabili da JS via window.pywebview.api.*"""

    # ── Sessione / token ───────────────────────────────────────────────────────
    _TOKEN_FILE = os.path.join(APP_DIR, '.session_token')

    def store_token(self, token: str) -> dict:
        """Salva il JWT su file per persistere la sessione tra riavvii."""
        try:
            with open(self._TOKEN_FILE, 'w', encoding='utf-8') as f:
                f.write(token)
            return {'ok': True}
        except Exception as e:
            return {'ok': False, 'msg': str(e)}

    def get_token(self) -> dict:
        """Legge il JWT salvato (se esiste e non è vuoto)."""
        try:
            if os.path.exists(self._TOKEN_FILE):
                token = pathlib.Path(self._TOKEN_FILE).read_text(encoding='utf-8').strip()
                if token:
                    return {'ok': True, 'token': token}
        except Exception:
            pass
        return {'ok': False, 'token': None}

    def clear_token(self) -> dict:
        """Elimina il JWT salvato (logout)."""
        try:
            if os.path.exists(self._TOKEN_FILE):
                os.remove(self._TOKEN_FILE)
        except Exception:
            pass
        return {'ok': True}

    # ── Download file ──────────────────────────────────────────────────────────
    def save_file(self, filename: str, b64_content: str) -> dict:
        """
        Riceve il file come stringa base64 e mostra la dialog di salvataggio Windows.
        Ritorna {'ok': True, 'path': '...'} oppure {'ok': False, 'msg': '...'}.
        """
        try:
            import tkinter
            from tkinter import filedialog

            ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'bin'
            mime_map = {
                'xlsx': 'Excel (.xlsx)', 'xls': 'Excel (.xls)',
                'csv': 'CSV (.csv)', 'tsv': 'TSV (.tsv)',
                'pdf': 'PDF (.pdf)', 'json': 'JSON (.json)',
                'xml': 'XML (.xml)', 'txt': 'Testo (.txt)',
            }
            type_label = mime_map.get(ext, f'File .{ext}')

            root = tkinter.Tk()
            root.withdraw()
            root.wm_attributes('-topmost', True)
            root.update()

            # Cartella Download predefinita
            downloads = str(pathlib.Path.home() / 'Downloads')

            save_path = filedialog.asksaveasfilename(
                parent=root,
                title='Salva file esportato',
                initialdir=downloads,
                initialfile=filename,
                defaultextension=f'.{ext}',
                filetypes=[(type_label, f'*.{ext}'), ('Tutti i file', '*.*')],
            )
            root.destroy()

            if not save_path:
                return {'ok': False, 'msg': 'Annullato'}

            data = base64.b64decode(b64_content)
            with open(save_path, 'wb') as f:
                f.write(data)

            return {'ok': True, 'path': save_path, 'filename': os.path.basename(save_path)}

        except Exception as e:
            return {'ok': False, 'msg': str(e)}

    def get_downloads_path(self) -> str:
        return str(pathlib.Path.home() / 'Downloads')


def _start_tray(window_ref: list):
    """System tray — mostra/nascondi la finestra desktop."""
    try:
        import pystray
        from PIL import Image, ImageDraw, ImageFont

        def _make_icon(size=64):
            img  = Image.new('RGB', (size, size), '#151824')
            draw = ImageDraw.Draw(img)
            draw.ellipse([4, 4, size - 4, size - 4], fill='#2563eb')
            try:
                font = ImageFont.truetype('arial.ttf', size // 3)
            except Exception:
                font = ImageFont.load_default()
            text = 'IK'
            try:
                bbox = draw.textbbox((0, 0), text, font=font)
                tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            except AttributeError:
                tw, th = draw.textsize(text, font=font)
            draw.text(((size - tw) / 2, (size - th) / 2), text, fill='white', font=font)
            return img

        def _on_show(icon, item):
            if window_ref[0]:
                try:
                    window_ref[0].show()
                except Exception:
                    pass

        def _on_quit(icon, item):
            icon.stop()
            os._exit(0)

        icon = pystray.Icon(
            'AS400ImporterPro',
            _make_icon(),
            'AS400 Data Importer Pro',
            menu=pystray.Menu(
                pystray.MenuItem('Apri', _on_show, default=True),
                pystray.MenuItem('Esci', _on_quit),
            )
        )
        icon.run()
    except Exception:
        pass


# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == '__main__':

    # Auto-rileva Java prima di avviare il backend
    java_found = _find_java()

    # Altra istanza già in esecuzione → apri solo una nuova finestra
    if not _port_free(PORT):
        try:
            import webview
            w = webview.create_window(
                'AS400 Data Importer Pro', URL,
                width=1280, height=800, min_size=(900, 600)
            )
            webview.start()
        except Exception:
            import webbrowser
            webbrowser.open(URL)
        sys.exit(0)

    # Avvia il server FastAPI in background
    threading.Thread(target=_start_server, daemon=True).start()

    # Aspetta che il server sia pronto
    if not _wait_server():
        _show_error('Il server non si è avviato entro 20 secondi.')
        sys.exit(1)

    # ── Finestra desktop nativa con pywebview ──────────────────────────────────
    try:
        import webview

        api = AppApi()
        window_ref = [None]
        window_ref[0] = webview.create_window(
            'AS400 Data Importer Pro — Ikonet Solutions',
            URL,
            width=1280,
            height=800,
            min_size=(900, 600),
            js_api=api,
        )

        # Tray in background (permette di minimizzare nella tray)
        threading.Thread(target=_start_tray, args=(window_ref,), daemon=True).start()

        # Mostra avviso Java se non trovato (non blocca l'avvio)
        if not java_found:
            def _warn_java():
                time.sleep(2)
                _show_java_error()
            threading.Thread(target=_warn_java, daemon=True).start()

        webview.start()  # blocca fino alla chiusura della finestra

    except Exception:
        # Fallback: browser classico se pywebview non disponibile
        import webbrowser
        webbrowser.open(URL)

        if not java_found:
            _show_java_error()

        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
