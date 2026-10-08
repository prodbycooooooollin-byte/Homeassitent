"""Einstiegspunkt für die EXE: startet Bot und Dashboard zusammen."""
import os
import re
import sys
import threading
import traceback
from pathlib import Path

from dotenv import load_dotenv

# Neben der EXE liegen .env, counter.db und crash.log (nicht im temporären PyInstaller-Ordner)
BASE = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).parent
os.chdir(BASE)
ENV = BASE / ".env"
LOG = BASE / "crash.log"
load_dotenv(ENV)

PLACEHOLDERS = {"", "dein-bot-token", "hier-der-neue-token"}


def set_env_value(key: str, value: str) -> None:
    text = ENV.read_text(encoding="utf-8") if ENV.exists() else ""
    line = f"{key}={value}"
    if re.search(rf"^{key}=.*$", text, flags=re.M):
        text = re.sub(rf"^{key}=.*$", lambda _: line, text, flags=re.M)
    else:
        text += ("\n" if text and not text.endswith("\n") else "") + line + "\n"
    ENV.write_text(text, encoding="utf-8")


def ensure_token() -> str:
    token = os.getenv("DISCORD_TOKEN", "").strip()
    if token in PLACEHOLDERS:
        print("Kein Bot-Token gefunden. Füge ihn hier ein (Developer Portal -> Bot -> Reset Token).")
        while token in PLACEHOLDERS:
            token = input("Token: ").strip().strip('"')
        set_env_value("DISCORD_TOKEN", token)
        print(f"Token gespeichert in {ENV}")
    return token


def pause(msg: str = "Drücke Enter zum Beenden...") -> None:
    try:
        input(msg)
    except EOFError:
        pass


def main() -> None:
    token = ensure_token()
    print("Lade Spracherkennung (beim ersten Start wird ein Modell heruntergeladen, das dauert einige Minuten)...")
    import discord

    import bot

    if os.getenv("WEB_DASHBOARD") == "1":  # optional: zusätzlich Browser-Dashboard
        import dashboard

        threading.Thread(target=dashboard.serve, daemon=True).start()
    try:
        bot.bot.run(token)
    except discord.LoginFailure:
        set_env_value("DISCORD_TOKEN", "")
        print("\nDer Token ist ungültig (oder wurde zurückgesetzt). Er wurde gelöscht.")
        print("Starte die EXE neu und füge den aktuellen Token aus dem Developer Portal ein.")
        pause()
    except discord.PrivilegedIntentsRequired:
        print("\nIm Developer Portal unter 'Bot' muss 'Server Members Intent' eingeschaltet sein.")
        pause()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        err = traceback.format_exc()
        LOG.write_text(err, encoding="utf-8")
        print("\nFEHLER:\n" + err)
        print(f"(Der Fehler steht auch in {LOG})")
        pause()
