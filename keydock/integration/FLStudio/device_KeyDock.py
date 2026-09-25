# name=KeyDock Tempo Bridge
# supportedDevices=KeyDock
#
# FL Studio MIDI controller script that lets KeyDock set the project tempo.
#
# Why this exists: VST3 gives a plugin no way to write the host tempo. The
# process context is read-only, by design. FL Studio's MIDI Controller
# Scripting API, on the other hand, exposes the tempo as a REC event, which is
# a documented and supported way to set it.
#
# Installation and the required virtual MIDI port are described in
# docs/07-neue-funktionen.md.
#
# Protocol: KeyDock sends a SysEx message
#     F0 7D 4B 44 <op> <payload...> F7
#   7D      non-commercial manufacturer id, safe for private use
#   4B 44   'K' 'D'
#   op 0x01 set tempo, payload = 4 bytes, 7 bits each, big endian,
#           carrying BPM * 1000 (so 147.5 BPM is 147500)
#   op 0x02 ping, no payload

import general
import device
import midi
import ui

KEYDOCK_HEADER = [0xF0, 0x7D, 0x4B, 0x44]

OP_SET_TEMPO = 0x01
OP_PING = 0x02

# FL Studio's own tempo limits. Anything outside this is refused rather than
# clamped silently, so a bad message cannot quietly change the project.
MIN_BPM = 10.0
MAX_BPM = 522.0

_last_tempo_milli = None


def OnInit():
    print("KeyDock tempo bridge ready")
    device.setHasMeters()


def OnDeInit():
    print("KeyDock tempo bridge stopped")


def _decode_7bit(payload):
    """Four 7-bit bytes, big endian, back into one integer."""
    if len(payload) != 4:
        return None
    value = 0
    for byte in payload:
        if byte > 0x7F:
            return None
        value = (value << 7) | byte
    return value


def _set_tempo(milli_bpm):
    global _last_tempo_milli

    bpm = milli_bpm / 1000.0
    if bpm < MIN_BPM or bpm > MAX_BPM:
        print("KeyDock: %.3f BPM is outside FL Studio's range, ignored" % bpm)
        return

    # REC_Tempo takes the tempo multiplied by 1000.
    # REC_Control sets the value, REC_UpdateControl refreshes the display.
    general.processRECEvent(
        midi.REC_Tempo,
        int(milli_bpm),
        midi.REC_Control | midi.REC_UpdateControl | midi.REC_UpdatePlugLabel,
    )

    _last_tempo_milli = milli_bpm
    ui.setHintMsg("KeyDock: Tempo %.2f BPM" % bpm)
    print("KeyDock: project tempo set to %.3f BPM" % bpm)


def OnSysEx(event):
    data = list(event.sysex)

    if len(data) < 6 or data[:4] != KEYDOCK_HEADER:
        return

    op = data[4]

    if op == OP_PING:
        print("KeyDock: ping")
        ui.setHintMsg("KeyDock verbunden")
        event.handled = True
        return

    if op == OP_SET_TEMPO:
        # data[5:-1] is the payload, data[-1] is the 0xF7 terminator.
        value = _decode_7bit(data[5:-1])
        if value is None:
            print("KeyDock: malformed tempo message, ignored")
        else:
            _set_tempo(value)
        event.handled = True
        return
