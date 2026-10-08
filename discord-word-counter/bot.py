import asyncio
import io
import logging
import os
import time
from collections import Counter

import discord
from discord import app_commands
from discord.ext import voice_recv
from dotenv import load_dotenv

from db import Store
from charts import render
from matcher import count_hits
from stats import compute
from transcriber import Transcriber

load_dotenv()

# Jitter-Buffer-Warnungen und RTCP-Infos der Bibliothek sind harmlos und füllen nur die Konsole
for _name in ("discord.ext.voice_recv.opus", "discord.ext.voice_recv.reader", "discord.ext.voice_recv.gateway"):
    logging.getLogger(_name).setLevel(logging.ERROR)

BYTES_PER_SEC = 48000 * 2 * 2  # 48 kHz, stereo, int16
SILENCE_FLUSH = 0.9  # Sekunden Stille, bis ein Sprachabschnitt ausgewertet wird
MAX_SEGMENT = 20  # Sekunden, danach wird in jedem Fall ausgewertet

DEBUG_TEXT = os.getenv("DEBUG_TRANSCRIPTS", "1") == "1"  # Konsole zeigt, was erkannt wurde (wird nicht gespeichert)
diag = Counter()  # Diagnose-Zähler für die Konsole

store = Store(os.getenv("DB_PATH", "counter.db"))
transcriber = Transcriber(os.getenv("WHISPER_MODEL", "small"), os.getenv("WHISPER_LANGUAGE", "de"))


SILENCE_FRAME = b"\xf8\xff\xfe"  # gültiger Opus-Stille-Frame
_first_errors: list[str] = []


def protect_opus_decoding() -> None:
    """Ein einziger Opus-Fehler würde in voice_recv das Zuhören dauerhaft beenden.
    Defekte Pakete werden deshalb als Stille behandelt."""
    from discord.ext.voice_recv import opus as vr_opus
    from discord.opus import OpusError

    original = vr_opus.PacketDecoder._decode_packet
    if getattr(original, "_protected", False):
        return

    def safe_decode(self, packet):
        try:
            return original(self, packet)
        except OpusError:
            diag["opus_fehler"] += 1
            return packet, b"\x00" * 3840  # 20 ms Stille (48 kHz, stereo, int16)

    safe_decode._protected = True
    vr_opus.PacketDecoder._decode_packet = safe_decode


def install_dave_decryption(vc: voice_recv.VoiceRecvClient) -> None:
    """Discord verschlüsselt Sprache zusätzlich per DAVE (Ende-zu-Ende).
    voice_recv entschlüsselt nur die Transportschicht, daher hier die DAVE-Schicht nachrüsten."""
    try:
        import davey
    except ImportError:
        print("WARNUNG: 'davey' fehlt, Sprache kann nicht entschlüsselt werden.")
        return
    protect_opus_decoding()
    decryptor = vc._reader.decryptor
    transport_decrypt = decryptor.decrypt_rtp

    def decrypt_rtp(packet):
        data = transport_decrypt(packet)
        diag["pakete"] += 1
        state = vc._connection
        session = getattr(state, "dave_session", None)
        if not state.dave_protocol_version:
            return data  # kein E2EE aktiv
        if session is None or not session.ready:
            diag["dave_noch_nicht_bereit"] += 1
            return SILENCE_FRAME  # verschlüsselt, aber Schlüssel noch nicht da
        user_id = vc._ssrc_to_id.get(packet.ssrc)
        if user_id is None:
            diag["unbekannter_sprecher"] += 1
            return SILENCE_FRAME
        if data == SILENCE_FRAME:
            return data  # unverschlüsselte Stille
        try:
            out = session.decrypt(user_id, davey.MediaType.audio, data)
            diag["dave_ok"] += 1
            return out
        except Exception as e:
            if "UnencryptedWhenPassthroughDisabled" in str(e):
                diag["unverschluesselt"] += 1
                return data  # Paket war gar nicht DAVE-verschlüsselt (z. B. Sprecher ohne E2EE)
            diag["dave_fehler"] += 1
            if len(_first_errors) < 3:
                _first_errors.append(repr(e))
                print(f"[Diagnose] DAVE-Entschlüsselung fehlgeschlagen: {e!r}")
            return SILENCE_FRAME

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
        diag["abschnitte"] += 1
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


TZ = os.getenv("TIMEZONE", "Europe/Berlin")
RANGES = {"all": ("Gesamt", None), "30": ("Letzte 30 Tage", 30), "7": ("Letzte 7 Tage", 7), "1": ("Heute", 1)}


def build_dashboard(guild: discord.Guild, rng: str) -> tuple[discord.Embed, discord.File]:
    label, days = RANGES[rng]
    events = store.events(guild.id)
    if days:
        # "Heute" = seit Mitternacht (Serverzeit), sonst die letzten N Tage
        from datetime import datetime
        from zoneinfo import ZoneInfo
        midnight = datetime.now(ZoneInfo(TZ)).replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
        cutoff = midnight - (days - 1) * 86400
        events = [e for e in events if e[1] >= cutoff]
    names = store.names(guild.id)
    for uid, _, _ in events:  # Anzeigenamen aktuell halten
        m = guild.get_member(uid)
        if m:
            names[uid] = m.display_name
    d = compute(events, names, TZ)
    png = render(d, f"{guild.name}  ·  {label}")
    hour = f"{d['peak_hour']:02d}:00 Uhr" if d["peak_hour"] is not None else "–"
    best = f"{d['best_day']['count']}× am {d['best_day']['date'][8:]}.{d['best_day']['date'][5:7]}." if d["best_day"] else "–"
    top = f"{d['top_user']['name']} ({d['top_user']['count']})" if d["top_user"] else "–"
    embed = discord.Embed(title=f"📊 Dashboard · {label}", color=0xFF5A5F)
    embed.add_field(name="Gesamt", value=f"**{d['total']}**")
    embed.add_field(name="Heute", value=f"**{d['today']}**")
    embed.add_field(name="Letzte 7 Tage", value=f"**{d['last7']}**")
    embed.add_field(name="🏆 Spitzenreiter", value=top)
    embed.add_field(name="🕐 Stärkste Uhrzeit", value=hour)
    embed.add_field(name="🔥 Serie / Rekordtag", value=f"{d['streak']} Tage / {best}")
    embed.set_image(url="attachment://dashboard.png")
    embed.set_footer(text="Nur Anzahl, Zeit und Name werden gespeichert – kein Audio, kein Text.")
    return embed, discord.File(io.BytesIO(png), filename="dashboard.png")


class DashboardView(discord.ui.View):
    def __init__(self, guild: discord.Guild, rng: str):
        super().__init__(timeout=900)
        self.guild, self.rng = guild, rng
        sel = discord.ui.Select(
            placeholder="Zeitraum",
            options=[discord.SelectOption(label=v[0], value=k, default=(k == rng)) for k, v in RANGES.items()],
        )
        sel.callback = self.on_select
        self.add_item(sel)

    async def _update(self, interaction: discord.Interaction, rng: str):
        await interaction.response.defer()
        embed, file = await asyncio.to_thread(build_dashboard, self.guild, rng)
        await interaction.edit_original_response(embed=embed, attachments=[file], view=DashboardView(self.guild, rng))

    async def on_select(self, interaction: discord.Interaction):
        await self._update(interaction, interaction.data["values"][0])

    @discord.ui.button(label="Aktualisieren", emoji="🔄", style=discord.ButtonStyle.secondary)
    async def refresh(self, interaction: discord.Interaction, _button: discord.ui.Button):
        await self._update(interaction, self.rng)


@tree.command(name="dashboard", description="Dashboard mit Statistiken und Diagrammen")
@app_commands.choices(zeitraum=[app_commands.Choice(name=v[0], value=k) for k, v in RANGES.items()])
async def dashboard_cmd(interaction: discord.Interaction, zeitraum: app_commands.Choice[str] | None = None):
    await interaction.response.defer()
    rng = zeitraum.value if zeitraum else "all"
    embed, file = await asyncio.to_thread(build_dashboard, interaction.guild, rng)
    await interaction.followup.send(embed=embed, file=file, view=DashboardView(interaction.guild, rng))


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
        if diag and dict(diag) != last:
            last = dict(diag)
            print(f"[Diagnose] {last}")


@bot.event
async def on_ready():
    await tree.sync()
    bot.loop.create_task(report_stats())
    print(f"Eingeloggt als {bot.user}")


if __name__ == "__main__":
    bot.run(os.environ["DISCORD_TOKEN"])
