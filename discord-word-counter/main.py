"""Einstiegspunkt für die EXE: startet Bot und Dashboard zusammen."""
import os
import sys
import threading
from pathlib import Path

from dotenv import load_dotenv

# Neben der EXE liegen .env und counter.db (nicht im temporären PyInstaller-Ordner)
BASE = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).parent
os.chdir(BASE)
ENV = BASE / ".env"
load_dotenv(ENV)


def ensure_token() -> str:
    token = os.getenv("DISCORD_TOKEN", "").strip()
    while not token:
        print("Kein Bot-Token gefunden. Füge ihn hier ein (Developer Portal -> Bot -> Reset Token).")
        token = input("Token: ").strip().strip('"')
    if not ENV.exists() or "DISCORD_TOKEN" not in ENV.read_text(encoding="utf-8"):
        with ENV.open("a", encoding="utf-8") as f:
            f.write(f"\nDISCORD_TOKEN={token}\n")
        print(f"Token gespeichert in {ENV}")
    return token


if __name__ == "__main__":
    token = ensure_token()
    print("Lade Spracherkennung (beim ersten Start wird ein Modell heruntergeladen, das dauert)...")
    import bot  # lädt das Whisper-Modell
    import dashboard

    threading.Thread(target=dashboard.serve, daemon=True).start()
    bot.bot.run(token)
