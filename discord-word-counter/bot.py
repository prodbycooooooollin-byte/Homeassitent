import asyncio
import os
import time
from collections import Counter

import discord
from discord import app_commands
from discord.ext import voice_recv
from dotenv import load_dotenv

from db import Store
from matcher import count_hits
from transcriber import Transcriber

load_dotenv()

BYTES_PER_SEC = 48000 * 2 * 2  # 48 kHz, stereo, int16
SILENCE_FLUSH = 0.9  # Sekunden Stille, bis ein Sprachabschnitt ausgewertet wird
MAX_SEGMENT = 20  # Sekunden, danach wird in jedem Fall ausgewertet

DEBUG_TEXT = os.getenv("DEBUG_TRANSCRIPTS", "") == "1"  # Konsole zeigt, was erkannt wurde (wird nicht gespeichert)
stats = Counter()  # Diagnose-Zähler für die Konsole

store = Store(os.getenv("DB_PATH", "counter.db"))
transcriber = Transcriber(os.getenv("WHISPER_MODEL", "small"), os.getenv("WHISPER_LANGUAGE", "de"))


def install_dave_decryption(vc: voice_recv.VoiceRecvClient) -> None:
    """Discord verschlüsselt Sprache zusätzlich per DAVE (Ende-zu-Ende).
    voice_recv entschlüsselt nur die Transportschicht, daher hier die DAVE-Schicht nachrüsten."""
    try:
        import davey
    except ImportError:
        print("WARNUNG: 'davey' fehlt, Sprache kann nicht entschlüsselt werden.")
        return
    decryptor = vc._reader.decryptor
    transport_decrypt = decryptor.decrypt_rtp

    def decrypt_rtp(packet):
        data = transport_decrypt(packet)
        stats["pakete"] += 1
        state = vc._connection
        session = getattr(state, "dave_session", None)
        if session is None or not state.dave_protocol_version or not session.ready:
            return data  # kein E2EE aktiv
        user_id = vc._ssrc_to_id.get(packet.ssrc)
        if user_id is None:
            stats["unbekannter_sprecher"] += 1
            return data
        try:
            data = session.decrypt(user_id, davey.MediaType.audio, data)
            stats["dave_ok"] += 1
        except Exception:
            stats["dave_fehler"] += 1  # z. B. unverschlüsselte Stille-Pakete
        return data

    decryptor.decrypt_rtp = decrypt_rtp


class CountingSink(voice_recv.AudioSink):
    """Sammelt Audio pro Sprecher und wertet es nach einer Sprechpause aus."""

    def __init__(self, guild: discord.Guild):
        super().__init__()
        self.guild = guild
        self._buffers: dict[int, bytearray] = {}
        self._last: dict[int, float] = {}
        self._task: asyncio.Task | None = None
        self._loop = asyncio.get_running_loop()
        self._task = self._loop.create_task(self._flusher())

    def wants_opus(self) -> bool:
        return False  # wir wollen dekodiertes PCM

    def write(self, user, data: voice_recv.VoiceData) -> None:
        if user is None or user.bot or store.is_opted_out(self.guild.id, user.id):
            return
        self._buffers.setdefault(user.id, bytearray()).extend(data.pcm)
        self._last[user.id] = time.monotonic()

    async def _flusher(self) -> None:
        while True:
            await asyncio.sleep(0.5)
            now = time.monotonic()
            for uid in list(self._buffers):
                buf = self._buffers[uid]
                if now - self._last[uid] > SILENCE_FLUSH or len(buf) > MAX_SEGMENT * BYTES_PER_SEC:
                    del self._buffers[uid], self._last[uid]
                    self._loop.create_task(self._process(uid, bytes(buf)))

    async def _process(self, user_id: int, pcm: bytes) -> None:
        text = await self._loop.run_in_executor(None, transcriber.transcribe, pcm)
        hits = count_hits(text)
        member = self.guild.get_member(user_id)
        who = member.display_name if member else str(user_id)
        secs = len(pcm) / BYTES_PER_SEC
        stats["abschnitte"] += 1
        print(f"[Sprache] {who}: {secs:.1f}s, Treffer: {hits}" + (f", Text: {text.strip()!r}" if DEBUG_TEXT else ""))
        if hits:
            member = self.guild.get_member(user_id)
            # Text selbst wird nicht gespeichert, nur Anzahl, Zeitpunkt und Anzeigename
            store.add(self.guild.id, user_id, hits, member.display_name if member else None, self.guild.name)

    def cleanup(self) -> None:
        if self._task:
            self._task.cancel()
        self._buffers.clear()


intents = discord.Intents.default()
intents.members = True  # nötig, um Namen in der Rangliste aufzulösen
bot = discord.Client(intents=intents)
tree = app_commands.CommandTree(bot)


@tree.command(name="join", description="Bot tritt deinem Sprachkanal bei und beginnt zu zählen")
async def join(interaction: discord.Interaction):
    member = interaction.user
    if not isinstance(member, discord.Member) or not member.voice or not member.voice.channel:
        return await interaction.response.send_message("Geh erst in einen Sprachkanal.", ephemeral=True)
    if interaction.guild.voice_client:
        return await interaction.response.send_message("Ich bin schon in einem Kanal.", ephemeral=True)
    vc = await member.voice.channel.connect(cls=voice_recv.VoiceRecvClient)
    vc.listen(CountingSink(interaction.guild))
    install_dave_decryption(vc)
    await interaction.response.send_message(
        "🎙️ **Hinweis:** Ich höre diesem Kanal zu und zähle ein bestimmtes Wort pro Person. "
        "Audio wird lokal in Text umgewandelt und sofort verworfen; gespeichert wird nur die Anzahl. "
        "Mit `/optout` wirst du nicht mehr erfasst und deine Daten werden gelöscht."
    )


@tree.command(name="leave", description="Bot verlässt den Sprachkanal")
async def leave(interaction: discord.Interaction):
    vc = interaction.guild.voice_client
    if not vc:
        return await interaction.response.send_message("Ich bin in keinem Kanal.", ephemeral=True)
    await vc.disconnect()
    await interaction.response.send_message("Tschüss 👋")


@tree.command(name="leaderboard", description="Rangliste: wer das Wort am häufigsten gesagt hat")
async def leaderboard(interaction: discord.Interaction):
    rows = store.top(interaction.guild.id)
    if not rows:
        return await interaction.response.send_message("Noch keine Einträge.")
    medals = ["🥇", "🥈", "🥉"]
    lines = [
        f"{medals[i] if i < 3 else f'`{i + 1}.`'} <@{uid}> — **{total}**"
        for i, (uid, total) in enumerate(rows)
    ]
    embed = discord.Embed(title="🏆 Rangliste", description="\n".join(lines), color=0xE74C3C)
    await interaction.response.send_message(embed=embed, allowed_mentions=discord.AllowedMentions.none())


@tree.command(name="stats", description="Zähler für dich oder eine andere Person")
async def stats(interaction: discord.Interaction, member: discord.Member | None = None):
    member = member or interaction.user
    await interaction.response.send_message(
        f"{member.display_name}: **{store.get(interaction.guild.id, member.id)}**",
        allowed_mentions=discord.AllowedMentions.none(),
    )


@tree.command(name="optout", description="Nicht mehr erfassen und deine Daten löschen")
async def optout(interaction: discord.Interaction):
    store.set_optout(interaction.guild.id, interaction.user.id, True)
    await interaction.response.send_message("Du wirst nicht mehr erfasst, deine Daten sind gelöscht.", ephemeral=True)


@tree.command(name="optin", description="Wieder erfasst werden")
async def optin(interaction: discord.Interaction):
    store.set_optout(interaction.guild.id, interaction.user.id, False)
    await interaction.response.send_message("Du wirst wieder erfasst.", ephemeral=True)


async def report_stats() -> None:
    last = None
    while True:
        await asyncio.sleep(15)
        if stats and dict(stats) != last:
            last = dict(stats)
            print(f"[Diagnose] {last}")


@bot.event
async def on_ready():
    await tree.sync()
    bot.loop.create_task(report_stats())
    print(f"Eingeloggt als {bot.user}")


if __name__ == "__main__":
    bot.run(os.environ["DISCORD_TOKEN"])
