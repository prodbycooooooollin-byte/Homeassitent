using System.Numerics;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

/// <summary>Einstellungen, die man im Spiel per Chat aendern kann.</summary>
static class TrainerConfig {
	/// <summary>Zusaetzlicher Yaw-Offset, damit Text-Entities zum Spieler zeigen (Test mit !ttest, Wechsel mit !tface).</summary>
	public static float TextYawOffset = 90f;
	/// <summary>Schrift fuer World-Text. null = Standard. Die Deadworks-Beispiele nutzen "Reaver" / "Radiance".</summary>
	public static string? Font = null;
	/// <summary>true: Ziele werden durch 0,25 s auf dem Ziel bleiben "getroffen" statt durch Klicken (Fallback, falls Klicks nicht ankommen).</summary>
	public static bool Dwell = false;
	public const double DwellMs = 250;
}

enum Level { Easy, Normal, Hard }

static class LevelParse {
	public static Level Parse(string? s) => (s ?? "").Trim().ToLowerInvariant() switch {
		"e" or "easy" or "leicht" or "1" => Level.Easy,
		"h" or "hard" or "schwer" or "3" => Level.Hard,
		_ => Level.Normal,
	};

	public static string Label(Level l) => l switch { Level.Easy => "leicht", Level.Hard => "schwer", _ => "normal" };
}

/// <summary>Basis fuer alle Uebungen. Eine Uebung gehoert genau einem Spieler.</summary>
abstract class Drill {
	protected readonly CCitadelPlayerController Ctl;
	protected readonly PlayerInput In;
	protected static readonly Random Rng = Random.Shared;
	private readonly List<CPointWorldText> _spawned = new();

	public bool Finished { get; set; }
	public abstract string Name { get; }

	protected Drill(CCitadelPlayerController ctl, PlayerInput input) {
		Ctl = ctl;
		In = input;
	}

	public abstract void Start(CCitadelPlayerPawn pawn, double nowMs);
	public abstract void Update(CCitadelPlayerPawn pawn, double nowMs);

	/// <summary>Raeumt alle erzeugten Entities weg. Wird bei Ende/Abbruch/Unload aufgerufen.</summary>
	public virtual void Stop() {
		foreach (var t in _spawned.ToArray()) Kill(t);
		_spawned.Clear();
	}

	protected void Say(string text) => Chat.PrintToChat(Ctl, text);

	protected CPointWorldText? SpawnText(string msg, Vector3 pos, Vector3 eye, float radius, byte r, byte g, byte b) {
		var t = CPointWorldText.Create(msg, pos, fontSize: 100f, r: r, g: g, b: b, fontName: TrainerConfig.Font, reorientMode: 0);
		if (t == null) return null;
		t.WorldUnitsPerPx = radius / 35f;
		t.JustifyHorizontal = HorizontalJustify.Center;
		t.JustifyVertical = VerticalJustify.Center;
		Face(t, pos, eye);
		_spawned.Add(t);
		return t;
	}

	protected static void Face(CPointWorldText t, Vector3 pos, Vector3 eye) =>
		t.Teleport(position: pos, angles: new Vector3(180f, Aim.YawTo(pos, eye) + TrainerConfig.TextYawOffset, 270f));

	protected void Kill(CPointWorldText? t) {
		if (t == null) return;
		_spawned.Remove(t);
		if (t.IsValid) t.Remove();
	}
}

// ---------------------------------------------------------------------------------------------------------------------
// Menue: Textfelder vor dir; draufschiessen waehlt die Uebung.
// ---------------------------------------------------------------------------------------------------------------------
sealed class MenuDrill : Drill {
	private readonly Action<string> _onSelect;
	private record Item(string Id, string Label, float YawOffset);
	private readonly List<(Item Item, CPointWorldText? Text, Vector3 Pos)> _items = new();
	private const float Dist = 380f;
	private const float HitDeg = 8f;
	private double _startedAt;
	private int _hover = -1;
	private double _hoverSince;

	public override string Name => "Menue";

	public MenuDrill(CCitadelPlayerController ctl, PlayerInput input, Action<string> onSelect) : base(ctl, input) => _onSelect = onSelect;

	public override void Start(CCitadelPlayerPawn pawn, double nowMs) {
		_startedAt = nowMs;
		var eye = Aim.Eye(pawn);
		float yaw = pawn.EyeAngles.Y;
		var items = new[] {
			new Item("parry", "PARRY", -38f),
			new Item("flick", "FLICK", -13f),
			new Item("track", "TRACK", 13f),
			new Item("stop", "ENDE", 38f),
		};
		foreach (var it in items) {
			var pos = eye + Aim.Forward(0f, yaw + it.YawOffset) * Dist;
			var t = SpawnText(it.Label, pos, eye, 24f, 255, 255, 255);
			_items.Add((it, t, pos));
		}
		var title = eye + Aim.Forward(-14f, yaw) * Dist;
		SpawnText("TRAINING - Schiess auf eine Uebung", title, eye, 12f, 255, 200, 0);
		Say("[Training] Menue offen: Ziele mit dem Fadenkreuz anvisieren und schiessen (oder !parry / !flick / !track).");
		while (In.Shots.Count > 0) In.Shots.Dequeue(); // alte Klicks verwerfen
	}

	public override void Update(CCitadelPlayerPawn pawn, double nowMs) {
		if (nowMs - _startedAt > 120_000) {
			Say("[Training] Menue geschlossen (Zeitueberschreitung). !train oeffnet es neu.");
			Finished = true;
			return;
		}
		var eye = Aim.Eye(pawn);
		var ang = pawn.EyeAngles;
		var fwd = Aim.Forward(ang);

		int hover = -1;
		for (int i = 0; i < _items.Count; i++)
			if (Aim.AngleTo(eye, fwd, _items[i].Pos) <= HitDeg) { hover = i; break; }

		if (hover != _hover) {
			if (_hover >= 0) _items[_hover].Text?.SetColor(255, 255, 255);
			if (hover >= 0) _items[hover].Text?.SetColor(255, 220, 0);
			_hover = hover;
			_hoverSince = nowMs;
		}

		// Texte mitdrehen, falls der Spieler sich bewegt.
		foreach (var (_, text, pos) in _items) if (text != null) Face(text, pos, eye);

		bool choose = false;
		while (In.Shots.Count > 0) {
			var s = In.Shots.Dequeue();
			for (int i = 0; i < _items.Count; i++)
				if (Aim.AngleTo(s.Eye, s.Forward, _items[i].Pos) <= HitDeg) { _hover = i; choose = true; break; }
			if (choose) break;
		}
		if (!choose && TrainerConfig.Dwell && _hover >= 0 && nowMs - _hoverSince >= 1000) choose = true;

		if (choose && _hover >= 0) {
			var id = _items[_hover].Item.Id;
			Finished = true;
			Stop();
			_onSelect(id);
		}
	}
}

// ---------------------------------------------------------------------------------------------------------------------
// Parry: Windup-Signal, dann "Treffer" zu einem festen Zeitpunkt. Dein Parry-Fenster muss den Treffer abdecken.
// ---------------------------------------------------------------------------------------------------------------------
sealed class ParryDrill : Drill {
	private enum Ph { Gap, Windup }

	private readonly int _rounds;
	private readonly Level _lvl;
	private Ph _ph = Ph.Gap;
	private int _round;
	private double _nextCue;
	private double _cueStart, _strikeAt;
	private bool _fake, _sampled, _activeAtStrike;
	private int _edgeSeen;
	private readonly List<double> _edges = new();
	private CPointWorldText? _cue;

	private int _ok, _early, _late, _missed, _fakeOk, _fakeFail, _fakeCount;
	private readonly List<double> _offsets = new();
	private readonly List<double> _reactions = new();

	public override string Name => "Parry";

	public ParryDrill(CCitadelPlayerController ctl, PlayerInput input, int rounds, Level lvl) : base(ctl, input) {
		_rounds = Math.Clamp(rounds, 1, 100);
		_lvl = lvl;
	}

	private double WindupMs() => _lvl switch {
		Level.Easy => 700,
		Level.Hard => 250 + Rng.NextDouble() * 450,
		_ => 500,
	};

	private double GapMs() => _lvl switch {
		Level.Easy => 1500 + Rng.NextDouble() * 1000,
		Level.Hard => 600 + Rng.NextDouble() * 2900,
		_ => 1000 + Rng.NextDouble() * 2000,
	};

	private double FeintChance() => _lvl switch { Level.Easy => 0.0, Level.Hard => 0.30, _ => 0.15 };

	public override void Start(CCitadelPlayerPawn pawn, double nowMs) {
		_nextCue = nowMs + 2000;
		_edgeSeen = In.ParryEdges;
		Say($"[Parry] {_rounds} Runden, Stufe {LevelParse.Label(_lvl)}.");
		Say("[Parry] Rotes >> << = gleich kommt ein Treffer: parry so, dass dein Parry-Fenster den Treffer abdeckt (Treffer-Signal: '!!!' + Ton).");
		if (FeintChance() > 0) Say("[Parry] Blaues '?' = Finte, NICHT parieren.");
		Say("[Parry] Zum Abbrechen: !tstop");
	}

	public override void Update(CCitadelPlayerPawn pawn, double nowMs) {
		if (In.ParryEdges != _edgeSeen) {
			_edgeSeen = In.ParryEdges;
			if (_ph == Ph.Windup) _edges.Add(In.LastParryEdgeMs);
		}

		if (_ph == Ph.Gap) {
			if (nowMs >= _nextCue) BeginRound(pawn, nowMs);
			return;
		}

		// Windup
		if (_cue != null) Face(_cue, _cuePos, Aim.Eye(pawn));

		if (!_sampled && nowMs >= _strikeAt) {
			_sampled = true;
			_activeAtStrike = In.ParryActive;
			if (_cue != null) {
				if (_fake) { _cue.SetMessage("--"); _cue.SetColor(120, 120, 120); }
				else { _cue.SetMessage("!!!"); _cue.SetColor(255, 255, 255); }
			}
			if (!_fake) pawn.EmitSound("Damage.Send.Crit", volume: 0.5f);
		}

		if (_sampled && nowMs >= _strikeAt + 450) FinishRound(nowMs);
	}

	private Vector3 _cuePos;

	private void BeginRound(CCitadelPlayerPawn pawn, double nowMs) {
		_round++;
		_fake = Rng.NextDouble() < FeintChance();
		if (_fake) _fakeCount++;
		_cueStart = nowMs;
		_strikeAt = nowMs + WindupMs();
		_sampled = false;
		_activeAtStrike = false;
		_edges.Clear();
		_edgeSeen = In.ParryEdges;

		var eye = Aim.Eye(pawn);
		_cuePos = eye + Aim.Forward(-4f, pawn.EyeAngles.Y) * 260f;
		Kill(_cue);
		_cue = _fake
			? SpawnText("?", _cuePos, eye, 30f, 80, 140, 255)
			: SpawnText(">>   <<", _cuePos, eye, 30f, 255, 40, 40);
		_ph = Ph.Windup;
	}

	private void FinishRound(double nowMs) {
		Kill(_cue);
		_cue = null;
		double t = _strikeAt;
		string head = $"[Parry {_round}/{_rounds}]";

		if (_fake) {
			if (_edges.Count > 0) { _fakeFail++; Say($"{head} FINTE - hier haettest du NICHT parieren sollen."); }
			else { _fakeOk++; Say($"{head} Finte erkannt."); }
		} else {
			bool success = _activeAtStrike || _edges.Any(e => e >= t && e <= t + 40);
			if (success) {
				_ok++;
				double first = _edges.Count > 0 ? _edges[0] : t;
				double offset = first - t; // negativ = frueher gedrueckt als der Treffer
				_offsets.Add(offset);
				if (_edges.Count > 0) _reactions.Add(first - _cueStart);
				string where = offset < -20 ? "frueh" : offset > 20 ? "spaet" : "perfekt";
				Say($"{head} PARRY! Druck {Fmt.Signed(offset)} zum Treffer ({where})" +
					(_edges.Count > 0 ? $", Reaktion {Fmt.Ms(first - _cueStart)}" : ""));
			} else if (_edges.Count > 0) {
				double e = _edges[^1];
				if (e > t) { _late++; Say($"{head} ZU SPAET: {Fmt.Ms(e - t)} nach dem Treffer."); }
				else { _early++; Say($"{head} ZU FRUEH: {Fmt.Ms(t - e)} vor dem Treffer gedrueckt, Fenster war schon zu."); }
			} else {
				_missed++;
				Say($"{head} VERPENNT - kein Parry.");
			}
		}

		if (_round >= _rounds) {
			Summarize();
			Finished = true;
			return;
		}
		_ph = Ph.Gap;
		_nextCue = nowMs + GapMs();
	}

	private void Summarize() {
		int real = _rounds - _fakeCount;
		double rate = real > 0 ? 100.0 * _ok / real : 0;
		Say($"=== Parry-Training fertig ({LevelParse.Label(_lvl)}) ===");
		Say($"Parries: {_ok}/{real} ({rate:0}%) | zu frueh {_early} | zu spaet {_late} | verpennt {_missed}");
		if (_fakeCount > 0) Say($"Finten erkannt: {_fakeOk}/{_fakeCount}");
		if (_offsets.Count > 0) {
			Say($"Durchschnitt Druckpunkt: {Fmt.Signed(_offsets.Average())} | Reaktion im Schnitt: " +
				(_reactions.Count > 0 ? Fmt.Ms(_reactions.Average()) : "-"));
		}
		bool best = Records.Submit($"parry_{_lvl}", rate);
		Say(best ? $"Neuer Bestwert fuer diese Sitzung: {rate:0}%" : $"Bestwert diese Sitzung: {Records.Get($"parry_{_lvl}"):0}%");
		Ctl.HudAnnounce("PARRY FERTIG", $"{_ok}/{real} ({rate:0}%)");
	}
}

// ---------------------------------------------------------------------------------------------------------------------
// Flick: Ziele erscheinen um dein Fadenkreuz herum; so schnell wie moeglich draufklicken.
// ---------------------------------------------------------------------------------------------------------------------
sealed class FlickDrill : Drill {
	private readonly int _count;
	private readonly Level _lvl;
	private int _spawned, _hits, _timeouts, _shotsFired;
	private readonly List<double> _reactions = new();

	private CPointWorldText? _target;
	private Vector3 _pos;
	private float _tolDeg;
	private bool _active;
	private double _spawnAtMs, _targetSpawnMs, _timeoutAt, _resultUntil, _dwellSince;

	public override string Name => "Flick";

	public FlickDrill(CCitadelPlayerController ctl, PlayerInput input, int count, Level lvl) : base(ctl, input) {
		_count = Math.Clamp(count, 1, 200);
		_lvl = lvl;
	}

	private float Radius() => _lvl switch { Level.Easy => 38f, Level.Hard => 15f, _ => 26f };
	private double TimeoutMs() => _lvl switch { Level.Easy => 3000, Level.Hard => 1500, _ => 2200 };

	public override void Start(CCitadelPlayerPawn pawn, double nowMs) {
		_spawnAtMs = nowMs + 2000;
		while (In.Shots.Count > 0) In.Shots.Dequeue();
		Say($"[Flick] {_count} Ziele, Stufe {LevelParse.Label(_lvl)}. Rote Kugeln 'O' erscheinen - schnell anvisieren und schiessen. Abbruch: !tstop");
	}

	public override void Update(CCitadelPlayerPawn pawn, double nowMs) {
		var eye = Aim.Eye(pawn);
		var fwd = Aim.Forward(pawn.EyeAngles);

		// Klicks auswerten.
		while (In.Shots.Count > 0) {
			var s = In.Shots.Dequeue();
			if (!_active) continue;
			_shotsFired++;
			if (s.TimeMs >= _targetSpawnMs && Aim.AngleTo(s.Eye, s.Forward, _pos) <= _tolDeg)
				Hit(s.TimeMs);
		}

		// Dwell-Fallback.
		if (_active && TrainerConfig.Dwell) {
			if (Aim.AngleTo(eye, fwd, _pos) <= _tolDeg) {
				if (_dwellSince == 0) _dwellSince = nowMs;
				else if (nowMs - _dwellSince >= TrainerConfig.DwellMs) Hit(nowMs);
			} else _dwellSince = 0;
		}

		if (_active && nowMs >= _timeoutAt) {
			_timeouts++;
			_active = false;
			_resultUntil = nowMs + 350;
			_target?.SetMessage("MISS");
			_target?.SetColor(120, 120, 120);
		}

		if (!_active && _target != null && nowMs >= _resultUntil) {
			Kill(_target);
			_target = null;
			if (_spawned >= _count) { Summarize(); Finished = true; return; }
			_spawnAtMs = nowMs + 350 + Rng.NextDouble() * 600;
		}

		if (!_active && _target == null && _spawned < _count && nowMs >= _spawnAtMs)
			Spawn(pawn, eye, nowMs);

		if (_target != null) Face(_target, _pos, eye);
	}

	private void Spawn(CCitadelPlayerPawn pawn, Vector3 eye, double nowMs) {
		float yaw = pawn.EyeAngles.Y + (Rng.Next(2) == 0 ? -1 : 1) * (20f + (float)Rng.NextDouble() * 45f);
		float pitch = -20f + (float)Rng.NextDouble() * 35f;
		float dist = 650f + (float)Rng.NextDouble() * 450f;
		_pos = eye + Aim.Forward(pitch, yaw) * dist;
		float radius = Radius();
		_tolDeg = Aim.AngularRadius(radius * 0.9f, dist);
		_target = SpawnText("O", _pos, eye, radius, 255, 40, 40);
		_spawned++;
		_active = _target != null;
		_targetSpawnMs = nowMs;
		_timeoutAt = nowMs + TimeoutMs();
		_dwellSince = 0;
		if (_target == null) {
			Say("[Flick] Konnte kein Ziel erzeugen (World-Text nicht verfuegbar). Abbruch.");
			Finished = true;
		}
	}

	private void Hit(double atMs) {
		double react = atMs - _targetSpawnMs;
		_hits++;
		_reactions.Add(react);
		_active = false;
		_resultUntil = atMs + 350;
		_target?.SetMessage($"{react:0} ms");
		_target?.SetColor(60, 255, 90);
		Ctl.GetHeroPawn()?.EmitSound("Damage.Send.Crit", volume: 0.3f);
	}

	private void Summarize() {
		Say($"=== Flick-Training fertig ({LevelParse.Label(_lvl)}) ===");
		Say($"Treffer: {_hits}/{_count} ({Fmt.Pct(_hits, _count)}) | verpasst (Zeit abgelaufen): {_timeouts} | Genauigkeit: {Fmt.Pct(_hits, _shotsFired)} ({_shotsFired} Schuesse)");
		if (_reactions.Count > 0) {
			var sorted = _reactions.OrderBy(x => x).ToList();
			double avg = _reactions.Average();
			Say($"Reaktion: Ø {Fmt.Ms(avg)} | Median {Fmt.Ms(sorted[sorted.Count / 2])} | beste {Fmt.Ms(sorted[0])}");
			bool best = Records.Submit($"flick_{_lvl}", avg, higherIsBetter: false);
			Say(best ? $"Neuer Bestwert (Ø Reaktion): {avg:0} ms" : $"Bestwert diese Sitzung: {Records.Get($"flick_{_lvl}"):0} ms");
		}
		Ctl.HudAnnounce("FLICK FERTIG", $"{_hits}/{_count}");
	}
}

// ---------------------------------------------------------------------------------------------------------------------
// Tracking: ein Ziel bewegt sich glatt hin und her; Fadenkreuz draufhalten (und dabei schiessen).
// ---------------------------------------------------------------------------------------------------------------------
sealed class TrackDrill : Drill {
	private readonly double _durationMs;
	private readonly Level _lvl;
	private CPointWorldText? _target;
	private Vector3 _center, _right;
	private double _startMs, _lastMs;
	private double _total, _onTarget, _firing, _firingOn;
	private bool _wasOn;
	private readonly double _p1, _p2, _p3;

	public override string Name => "Tracking";

	public TrackDrill(CCitadelPlayerController ctl, PlayerInput input, int seconds, Level lvl) : base(ctl, input) {
		_durationMs = Math.Clamp(seconds, 5, 300) * 1000.0;
		_lvl = lvl;
		_p1 = Rng.NextDouble() * Math.PI * 2;
		_p2 = Rng.NextDouble() * Math.PI * 2;
		_p3 = Rng.NextDouble() * Math.PI * 2;
	}

	private float Radius() => _lvl switch { Level.Easy => 45f, Level.Hard => 22f, _ => 32f };
	private double Speed() => _lvl switch { Level.Easy => 0.5, Level.Hard => 1.5, _ => 0.9 };

	public override void Start(CCitadelPlayerPawn pawn, double nowMs) {
		var eye = Aim.Eye(pawn);
		float yaw = pawn.EyeAngles.Y;
		_center = eye + Aim.Forward(4f, yaw) * 900f;
		float yr = yaw * MathF.PI / 180f;
		_right = new Vector3(MathF.Sin(yr), -MathF.Cos(yr), 0f);
		_startMs = _lastMs = nowMs;
		_target = SpawnText("O", PosAt(0), eye, Radius(), 255, 40, 40);
		if (_target == null) {
			Say("[Tracking] Konnte kein Ziel erzeugen (World-Text nicht verfuegbar). Abbruch.");
			Finished = true;
			return;
		}
		Say($"[Tracking] {_durationMs / 1000:0} s, Stufe {LevelParse.Label(_lvl)}. Halte das Fadenkreuz auf der Kugel (gruen = auf dem Ziel) und schiesse dabei. Abbruch: !tstop");
	}

	private Vector3 PosAt(double tSec) {
		double w = Speed();
		double lat = 380 * Math.Sin(w * tSec + _p1) + 160 * Math.Sin(2.3 * w * tSec + _p2);
		double vert = 110 * Math.Sin(1.7 * w * tSec + _p3);
		return _center + _right * (float)lat + new Vector3(0f, 0f, (float)vert);
	}

	public override void Update(CCitadelPlayerPawn pawn, double nowMs) {
		while (In.Shots.Count > 0) In.Shots.Dequeue(); // Einzelklicks sind hier egal; gezaehlt wird "gehalten".

		double elapsed = nowMs - _startMs;
		double dt = Math.Clamp(nowMs - _lastMs, 0, 100);
		_lastMs = nowMs;

		var eye = Aim.Eye(pawn);
		var fwd = Aim.Forward(pawn.EyeAngles);
		var pos = PosAt(elapsed / 1000.0);
		float dist = Vector3.Distance(eye, pos);
		bool on = Aim.AngleTo(eye, fwd, pos) <= Aim.AngularRadius(Radius() * 0.9f, dist);

		_total += dt;
		if (on) _onTarget += dt;
		if (In.AttackHeld) { _firing += dt; if (on) _firingOn += dt; }

		if (_target != null) {
			Face(_target, pos, eye);
			if (on != _wasOn) {
				_wasOn = on;
				if (on) _target.SetColor(60, 255, 90); else _target.SetColor(255, 40, 40);
			}
		}

		if (elapsed >= _durationMs) {
			Summarize();
			Finished = true;
		}
	}

	private void Summarize() {
		Say($"=== Tracking fertig ({LevelParse.Label(_lvl)}) ===");
		Say($"Auf dem Ziel: {Fmt.Pct(_onTarget, _total)} der Zeit | beim Schiessen: {Fmt.Pct(_firingOn, _firing)} | Feuer an: {Fmt.Pct(_firing, _total)}");
		double score = _firing > 2000 ? 100.0 * _firingOn / _firing : 100.0 * _onTarget / Math.Max(_total, 1);
		bool best = Records.Submit($"track_{_lvl}", score);
		Say(best ? $"Neuer Bestwert: {score:0}%" : $"Bestwert diese Sitzung: {Records.Get($"track_{_lvl}"):0}%");
		Ctl.HudAnnounce("TRACKING FERTIG", Fmt.Pct(_onTarget, _total) + " auf dem Ziel");
	}
}
