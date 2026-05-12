import base64, hashlib, uuid
from cryptography.fernet import Fernet

def _key() -> bytes:
    # Chiave derivata dall'ID hardware — univoca per macchina
    hw = str(uuid.getnode())
    digest = hashlib.sha256(f"ikonet-as400-{hw}".encode()).digest()
    return base64.urlsafe_b64encode(digest)

def encrypt(text: str) -> str:
    return Fernet(_key()).encrypt(text.encode()).decode()

def decrypt(token: str) -> str:
    return Fernet(_key()).decrypt(token.encode()).decode()
