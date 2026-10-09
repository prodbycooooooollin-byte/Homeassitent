using System.Drawing;
using System.Numerics;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

/// <summary>Einstellungen, die man im Spiel per Chat aendern kann.</summary>
static class TrainerConfig {
	/// <summary>Drehung der Text-Entities. Standard 270 = Text zeigt zum Spieler (mit !tface anpassbar).</summary>
	public static float TextYawOffset = 270f;
	/// <summary>Schrift fuer World-Text. null = Standard. Die Deadworks-Beispiele nutzen "Reaver" / "Radiance".</summary>
	public static string? Font = null;
	/// <summary>true: Ziele werden durch 0,25 s auf dem Ziel bleiben "getroffen" statt durch Klicken (Fallback, falls Klicks nicht ankommen).</summary>
	public static bool Dwell = false;
	public const double DwellMs = 250;

	/// <summary>Modell fuer Angreifer/Ziele (wird mit !tmodel geaendert).</summary>
	public static string BodyModel = Models.Werewolf;
	/// <summary>Hoehe der "Brust" ueber dem Boden bei Skalierung 1 (dorthin wird gezielt).</summary>
	public static float CenterZ = 55f;
}

static class Models {
	/// <summary>Aus den Deadworks-Beispielen (SetModelPlugin); wird in OnPrecacheResources vorgeladen.</summary>
	public const string Werewolf = "models/heroes_wip/werewolf/werewolf.vmdl";
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
	private readonly List<CPointWorldText> _texts = new();
	private readonly List<CBaseEntity> _bodies = new();

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
		foreach (var t in _texts.ToArray()) Kill(t);
		foreach (var b in _bodies.ToArray()) KillBody(b);
		_texts.Clear();
		_bodies.Clear();
	}

	protected void Say(string text) => Chat.PrintToChat(Ctl, text);

	// ---- Text ------------------------------------------------------------------------------------------------------

	protected CPointWorldText? SpawnText(string msg, Vector3 pos, Vector3 eye, float radius, byte r, byte g, byte b) {
		try {
			var t = CPointWorldText.Create(msg, pos, fontSize: 100f, r: r, g: g, b: b, fontName: TrainerConfig.Font, reorientMode: 0);
			if (t == null) return null;
			t.WorldUnitsPerPx = radius / 35f;
			t.JustifyHorizontal = HorizontalJustify.Center;
			t.JustifyVertical = VerticalJustify.Center;
			Face(t, pos, eye);
			_texts.Add(t);
			return t;
		} catch (Exception ex) {
			Console.WriteLine($"[Trainer] Text konnte nicht erzeugt werden: {ex.Message}");
			return null;
		}
	}

	protected static void Face(CPointWorldText t, Vector3 pos, Vector3 eye) =>
		t.Teleport(position: pos, angles: new Vector3(180f, Aim.YawTo(pos, eye) + TrainerConfig.TextYawOffset, 270f));

	protected void Kill(CPointWorldText? t) {
		if (t == null) return;
		_texts.Remove(t);
		try { if (t.IsValid) t.Remove(); } catch { /* Entity schon weg */ }
	}

	// ---- Figuren ---------------------------------------------------------------------------------------------------

	/// <summary>Erzeugt eine nicht-solide, sichtbare Figur (Modell) an der Bodenposition feet. null, wenn es nicht klappt.</summary>
	protected CBaseEntity? SpawnBody(Vector3 feet, float yaw, float scale, CCitadelPlayerPawn pawn) {
		try {
			var e = CBaseEntity.CreateByName("prop_dynamic");
			if (e == null) return null;
			e.Teleport(position: feet, angles: new Vector3(0f, yaw, 0f));
			var kv = new CEntityKeyValues();
			kv.SetString("model", TrainerConfig.BodyModel);
			kv.SetFloat("modelscale", scale);
			kv.SetInt("solid", 0);
			e.Spawn(kv);
			if (string.IsNullOrEmpty(e.ModelName)) e.SetModel(TrainerConfig.BodyModel);
			e.SetScale(scale);
			try { e.DisableCollisionsWith(pawn); } catch { /* nicht kritisch */ }
			_bodies.Add(e);
			return e;
		} catch (Exception ex) {
			Console.WriteLine($"[Trainer] Figur konnte nicht erzeugt werden: {ex.Message}");
			return null;
		}
	}

	protected static void Tint(CBaseEntity? e, byte r, byte g, byte b) {
		if (e == null) return;
		try { if (e.IsValid) e.RenderColor = Color.FromArgb(255, r, g, b); } catch { /* kein Modell-Entity */ }
	}

	protected static void MoveBody(CBaseEntity? e, Vector3 feet, Vector3 lookAt) {
		if (e == null) return;
		try {
			if (e.IsValid) e.Teleport(position: feet, angles: new Vector3(0f, Aim.YawTo(feet, lookAt), 0f));
		} catch { /* Entity schon weg */ }
	}

	protected void KillBody(CBaseEntity? e) {
		if (e == null) return;
		_bodies.Remove(e);
		try { if (e.IsValid) e.Remove(); } catch { /* Entity schon weg */ }
	}
}

// ---------------------------------------------------------------------------------------------------------------------
// Menue: dauerhaft vor dir; draufschiessen waehlt die Uebung. Bleibt bestehen, bis !train off.
// ---------------------------------------------------------------------------------------------------------------------
sealed class MenuDrill : Drill {
	private readonly Action<string> _onSelect;
	private readonly Vector3 _anchorEye;
	private readonly float _anchorYaw;
	private record Item(string Id, string Label, float YawOffset);
	private readonly List<(Item Item, CPointWorldText? Text, Vector3 Pos)> _items = new();
	private const float Dist = 380f;
	private const float HitDeg = 8f;
	private int _hover = -1;
	private double _hoverSince;

	public override string Name => "Menue";

	public MenuDrill(CCitadelPlayerController ctl, PlayerInput input, Action<string> onSelect, Vector3 anchorEye, float anchorYaw)
		: base(ctl, input) {
		_onSelect = onSelect;
		_anchorEye = anchorEye;
		_anchorYaw = anchorYaw;
	}

	public override void Start(CCitadelPlayerPawn pawn, double nowMs) {
		var eye = Aim.Eye(pawn);
		var items = new[] {
			new Item("parry", "PARRY", -38f),
			new Item("flick", "FLICK", -13f),
			new Item("track", "TRACK", 13f),
			new Item("stop", "MENUE AUS", 38f),
		};
		foreach (var it in items) {
			var pos = _anchorEye + Aim.Forward(0f, _anchorYaw + it.YawOffset) * Dist;
			var t = SpawnText(it.Label, pos, eye, 24f, 255, 255, 255);
			_items.Add((it, t, pos));
		}
		var title = _anchorEye + Aim.Forward(-14f, _anchorYaw) * Dist;
		SpawnText("TRAINING - schiess auf eine Uebung", title, eye, 12f, 255, 200, 0);
		Say("[Training] Menue ist da: Ziele mit dem Fadenkreuz anvisieren und schiessen. (!train off schliesst es)");
		while (In.Shots.Count > 0) In.Shots.Dequeue(); // alte Klicks verwerfen
	}

	public override void Update(CCitadelPlayerPawn pawn, double nowMs) {
		var eye = Aim.Eye(pawn);
		var fwd = Aim.Forward(pawn.EyeAngles);

		int hover = -1;
		for (int i = 0; i < _items.Count; i++)
			if (Aim.AngleTo(eye, fwd, _items[i].Pos) <= HitDeg) { hover = i; break; }

		if (hover != _hover) {
			if (_hover >= 0) _items[_hover].Text?.SetColor(255, 255, 255);
			if (hover >= 0) _items[hover].Text?.SetColor(255, 220, 0);
			_hover = hover;
			_hoverSince = nowMs;
		}

		// Texte zum Spieler drehen (falls er herumlaeuft).
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
// Parry: Angreifer-Figuren stehen um dich herum. Einer holt aus (rot), kurz darauf schlaegt er zu (Ausfall + Ton).
// Dein Parry-Fenster muss den Schlag abdecken. Blau = Finte, nicht parieren.
// ---------------------------------------------------------------------------------------------------------------------
sealed class ParryDrill : Drill {
	private enum Ph { Gap, Windup }

	private readonly int _rounds;
	private readonly Level _lvl;
	private readonly int _attackerCount;
	private Ph _ph = Ph.Gap;
	private int _round;
	private double _nextCue;
	private double _cueStart, _strikeAt;
	private bool _fake, _sampled, _activeAtStrike;
	private int _edgeSeen;
	private readonly List<double> _edges = new();
	private CPointWorldText? _cue;

	private readonly List<(CBaseEntity? Body, Vector3 Home)> _att = new();
	private int _cur = -1, _last = -1;
	private Vector3 _playerFeet;
	private Vector3 _cueFallbackPos;

	private int _ok, _early, _late, _missed, _fakeOk, _fakeFail, _fakeCount;
	private readonly List<double> _offsets = new();
	private readonly List<double> _reactions = new();

	private const float RingDist = 300f;
	private const double LungeOutMs = 140, LungeBackMs = 220;

	public override string Name => "Parry";

	public ParryDrill(CCitadelPlayerController ctl, PlayerInput input, int rounds, Level lvl, int attackers) : base(ctl, input) {
		_rounds = Math.Clamp(rounds, 1, 100);
		_lvl = lvl;
		_attackerCount = Math.Clamp(attackers, 1, 5);
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
		_nextCue = nowMs + 2500;
		_edgeSeen = In.ParryEdges;
		_playerFeet = pawn.Position;
		float yaw0 = pawn.EyeAngles.Y;
		var eye = Aim.Eye(pawn);

		for (int i = 0; i < _attackerCount; i++) {
			float frac = _attackerCount == 1 ? 0.5f : i / (float)(_attackerCount - 1);
			float yaw = yaw0 - 65f + frac * 130f;
			var home = new Vector3(_playerFeet.X, _playerFeet.Y, _playerFeet.Z) + Aim.Forward(0f, yaw) * RingDist;
			var body = SpawnBody(home, Aim.YawTo(home, _playerFeet), 1f, pawn);
			_att.Add((body, home));
		}
		_cueFallbackPos = eye + Aim.Forward(-4f, yaw0) * 260f;

		bool anyBody = _att.Any(a => a.Body != null);
		if (!anyBody)
			Say("[Parry] Hinweis: Figuren konnten nicht erzeugt werden (Modell?) - es gibt nur Text-Signale. Siehe !tmodel.");

		Say($"[Parry] {_rounds} Runden, Stufe {LevelParse.Label(_lvl)}, {_attackerCount} Angreifer.");
		Say("[Parry] ROT leuchtender Angreifer = er holt aus und schlaegt gleich zu: parry so, dass dein Parry-Fenster den Schlag abdeckt (Schlag = Ausfall + Ton).");
		if (FeintChance() > 0) Say("[Parry] BLAU leuchtender Angreifer = Finte, NICHT parieren.");
		Say("[Parry] Abbrechen: !tstop");
	}

	public override void Update(CCitadelPlayerPawn pawn, double nowMs) {
		_playerFeet = pawn.Position;
		var eye = Aim.Eye(pawn);

		if (In.ParryEdges != _edgeSeen) {
			_edgeSeen = In.ParryEdges;
			if (_ph == Ph.Windup) _edges.Add(In.LastParryEdgeMs);
		}

		// Alle Angreifer schauen den Spieler an (nur der aktive wird beim Zuschlagen bewegt).
		for (int i = 0; i < _att.Count; i++)
			if (i != _cur || _ph != Ph.Windup || !_sampled)
				MoveBody(_att[i].Body, _att[i].Home, _playerFeet);

		if (_ph == Ph.Gap) {
			if (nowMs >= _nextCue) BeginRound(nowMs, eye);
			return;
		}

		var (body, home) = _att[_cur];
		var cuePos = body != null ? home + new Vector3(0, 0, 135) : _cueFallbackPos;
		if (_cue != null) Face(_cue, cuePos, eye);

		if (!_sampled && nowMs >= _strikeAt) {
			_sampled = true;
			_activeAtStrike = In.ParryActive;
			if (_cue != null) {
				if (_fake) { _cue.SetMessage("--"); _cue.SetColor(120, 120, 120); }
				else { _cue.SetMessage("!!!"); _cue.SetColor(255, 255, 255); }
			}
			if (!_fake) { Tint(body, 255, 255, 255); pawn.EmitSound("Damage.Send.Crit", volume: 0.5f); }
			else Tint(body, 255, 255, 255);
		}

		// Ausfall: nur bei echtem Schlag.
		if (_sampled && !_fake && body != null) {
			double t = nowMs - _strikeAt;
			var dir = home - _playerFeet;
			dir.Z = 0;
			dir = dir.LengthSquared() > 1 ? Vector3.Normalize(dir) : Vector3.UnitX;
			var near = _playerFeet + dir * 85f;
			Vector3 pos;
			if (t <= LungeOutMs) pos = Vector3.Lerp(home, near, (float)(t / LungeOutMs));
			else if (t <= LungeOutMs + LungeBackMs) pos = Vector3.Lerp(near, home, (float)((t - LungeOutMs) / LungeBackMs));
			else pos = home;
			MoveBody(body, pos, _playerFeet);
		}

		if (_sampled && nowMs >= _strikeAt + 450) FinishRound(nowMs);
	}

	private void BeginRound(double nowMs, Vector3 eye) {
		_round++;
		_fake = Rng.NextDouble() < FeintChance();
		if (_fake) _fakeCount++;
		_cueStart = nowMs;
		_strikeAt = nowMs + WindupMs();
		_sampled = false;
		_activeAtStrike = false;
		_edges.Clear();
		_edgeSeen = In.ParryEdges;

		do { _cur = Rng.Next(_att.Count); } while (_att.Count > 1 && _cur == _last);
		_last = _cur;

		var (body, home) = _att[_cur];
		if (_fake) Tint(body, 80, 140, 255); else Tint(body, 255, 40, 40);

		Kill(_cue);
		var cuePos = body != null ? home + new Vector3(0, 0, 135) : _cueFallbackPos;
		_cue = _fake
			? SpawnText("?", cuePos, eye, 30f, 80, 140, 255)
			: SpawnText(">>   <<", cuePos, eye, 30f, 255, 40, 40);
		_ph = Ph.Windup;
	}

	private void FinishRound(double nowMs) {
		Kill(_cue);
		_cue = null;
		var (body, home) = _att[_cur];
		Tint(body, 255, 255, 255);
		MoveBody(body, home, _playerFeet);
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
				double offset = first - t; // negativ = frueher gedrueckt als der Schlag
				_offsets.Add(offset);
				if (_edges.Count > 0) _reactions.Add(first - _cueStart);
				string where = offset < -20 ? "frueh" : offset > 20 ? "spaet" : "perfekt";
				Say($"{head} PARRY! Druck {Fmt.Signed(offset)} zum Schlag ({where})" +
					(_edges.Count > 0 ? $", Reaktion {Fmt.Ms(first - _cueStart)}" : ""));
			} else if (_edges.Count > 0) {
				double e = _edges[^1];
				if (e > t) { _late++; Say($"{head} ZU SPAET: {Fmt.Ms(e - t)} nach dem Schlag."); }
				else { _early++; Say($"{head} ZU FRUEH: {Fmt.Ms(t - e)} vor dem Schlag gedrueckt, Fenster war schon zu."); }
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
// Flick: Figuren erscheinen um dich herum; so schnell wie moeglich draufschiessen.
// ---------------------------------------------------------------------------------------------------------------------
sealed class FlickDrill : Drill {
	private readonly int _count;
	private readonly Level _lvl;
	private int _spawned, _hits, _timeouts, _shotsFired;
	private readonly List<double> _reactions = new();

	private CBaseEntity? _body;
	private CPointWorldText? _label;
	private Vector3 _feet;
	private Vector3 _pos; // Zielpunkt (Brust)
	private float _tolDeg;
	private float _groundZ;
	private bool _active;
	private double _spawnAtMs, _targetSpawnMs, _timeoutAt, _resultUntil, _dwellSince;

	public override string Name => "Flick";

	public FlickDrill(CCitadelPlayerController ctl, PlayerInput input, int count, Level lvl) : base(ctl, input) {
		_count = Math.Clamp(count, 1, 200);
		_lvl = lvl;
	}

	private float Scale() => _lvl switch { Level.Easy => 1.35f, Level.Hard => 0.7f, _ => 1.0f };
	private double TimeoutMs() => _lvl switch { Level.Easy => 3000, Level.Hard => 1500, _ => 2200 };
	private bool HasTarget => _body != null || _label != null || _active;

	public override void Start(CCitadelPlayerPawn pawn, double nowMs) {
		_spawnAtMs = nowMs + 2000;
		_groundZ = pawn.Position.Z;
		while (In.Shots.Count > 0) In.Shots.Dequeue();
		Say($"[Flick] {_count} Ziele, Stufe {LevelParse.Label(_lvl)}. Figuren erscheinen um dich herum - schnell anvisieren und schiessen. Abbruch: !tstop");
	}

	public override void Update(CCitadelPlayerPawn pawn, double nowMs) {
		var eye = Aim.Eye(pawn);
		var fwd = Aim.Forward(pawn.EyeAngles);

		while (In.Shots.Count > 0) {
			var s = In.Shots.Dequeue();
			if (!_active) continue;
			_shotsFired++;
			if (s.TimeMs >= _targetSpawnMs && Aim.AngleTo(s.Eye, s.Forward, _pos) <= _tolDeg)
				Hit(pawn, s.TimeMs);
		}

		if (_active && TrainerConfig.Dwell) {
			if (Aim.AngleTo(eye, fwd, _pos) <= _tolDeg) {
				if (_dwellSince == 0) _dwellSince = nowMs;
				else if (nowMs - _dwellSince >= TrainerConfig.DwellMs) Hit(pawn, nowMs);
			} else _dwellSince = 0;
		}

		if (_active && nowMs >= _timeoutAt) {
			_timeouts++;
			_active = false;
			_resultUntil = nowMs + 400;
			Tint(_body, 120, 120, 120);
			_label = SpawnText("MISS", _pos + new Vector3(0, 0, 70 * Scale()), eye, 22f, 200, 200, 200);
		}

		if (!_active && HasTarget && nowMs >= _resultUntil) {
			KillBody(_body);
			_body = null;
			Kill(_label);
			_label = null;
			if (_spawned >= _count) { Summarize(); Finished = true; return; }
			_spawnAtMs = nowMs + 350 + Rng.NextDouble() * 600;
		}

		if (!_active && !HasTarget && _spawned < _count && nowMs >= _spawnAtMs)
			Spawn(pawn, eye, nowMs);

		if (_active) MoveBody(_body, _feet, eye);
		if (_label != null) Face(_label, _label.Position, eye);
	}

	private void Spawn(CCitadelPlayerPawn pawn, Vector3 eye, double nowMs) {
		float yaw = pawn.EyeAngles.Y + (Rng.Next(2) == 0 ? -1 : 1) * (20f + (float)Rng.NextDouble() * 55f);
		float dist = 450f + (float)Rng.NextDouble() * 450f;
		var origin = pawn.Position;
		float scale = Scale();
		_feet = new Vector3(origin.X, origin.Y, _groundZ) + Aim.Forward(0f, yaw) * dist;
		_pos = _feet + new Vector3(0, 0, TrainerConfig.CenterZ * scale);
		_tolDeg = Aim.AngularRadius(26f * scale * 0.9f, dist);

		_body = SpawnBody(_feet, Aim.YawTo(_feet, origin), scale, pawn);
		if (_body == null) {
			// Fallback: Text-Kugel.
			_label = SpawnText("O", _pos, eye, 26f * scale, 255, 40, 40);
			if (_label == null) {
				Say("[Flick] Konnte weder Figur noch Text erzeugen. Abbruch. (Siehe !tmodel / !ttest)");
				Finished = true;
				return;
			}
		} else Tint(_body, 255, 60, 60);

		_spawned++;
		_active = true;
		_targetSpawnMs = nowMs;
		_timeoutAt = nowMs + TimeoutMs();
		_dwellSince = 0;
	}

	private void Hit(CCitadelPlayerPawn pawn, double atMs) {
		double react = atMs - _targetSpawnMs;
		_hits++;
		_reactions.Add(react);
		_active = false;
		_resultUntil = atMs + 400;
		Tint(_body, 60, 255, 90);
		Kill(_label); // evtl. Fallback-Kugel
		_label = SpawnText($"{react:0} ms", _pos + new Vector3(0, 0, 70 * Scale()), Aim.Eye(pawn), 24f, 60, 255, 90);
		pawn.EmitSound("Damage.Send.Crit", volume: 0.3f);
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
// Tracking: eine Figur laeuft hin und her; Fadenkreuz draufhalten (und dabei schiessen).
// ---------------------------------------------------------------------------------------------------------------------
sealed class TrackDrill : Drill {
	private readonly double _durationMs;
	private readonly Level _lvl;
	private CBaseEntity? _body;
	private CPointWorldText? _fallbackText;
	private Vector3 _center, _right, _forward;
	private float _groundZ;
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

	private float Scale() => _lvl switch { Level.Easy => 1.35f, Level.Hard => 0.7f, _ => 1.0f };
	private double Speed() => _lvl switch { Level.Easy => 0.5, Level.Hard => 1.5, _ => 0.9 };

	public override void Start(CCitadelPlayerPawn pawn, double nowMs) {
		var origin = pawn.Position;
		float yaw = pawn.EyeAngles.Y;
		_groundZ = origin.Z;
		_forward = Aim.Forward(0f, yaw);
		float yr = yaw * MathF.PI / 180f;
		_right = new Vector3(MathF.Sin(yr), -MathF.Cos(yr), 0f);
		_center = new Vector3(origin.X, origin.Y, _groundZ) + _forward * 700f;
		_startMs = _lastMs = nowMs;

		var feet = FeetAt(0);
		_body = SpawnBody(feet, Aim.YawTo(feet, origin), Scale(), pawn);
		if (_body == null) {
			_fallbackText = SpawnText("O", feet + new Vector3(0, 0, TrainerConfig.CenterZ * Scale()), Aim.Eye(pawn), 26f * Scale(), 255, 40, 40);
			if (_fallbackText == null) {
				Say("[Tracking] Konnte weder Figur noch Text erzeugen. Abbruch. (Siehe !tmodel / !ttest)");
				Finished = true;
				return;
			}
		} else Tint(_body, 255, 60, 60);
		Say($"[Tracking] {_durationMs / 1000:0} s, Stufe {LevelParse.Label(_lvl)}. Halte das Fadenkreuz auf der Figur (gruen = auf dem Ziel) und schiesse dabei. Abbruch: !tstop");
	}

	private Vector3 FeetAt(double tSec) {
		double w = Speed();
		double lat = 380 * Math.Sin(w * tSec + _p1) + 160 * Math.Sin(2.3 * w * tSec + _p2);
		double depth = 120 * Math.Sin(0.7 * w * tSec + _p3);
		return _center + _right * (float)lat + _forward * (float)depth;
	}

	public override void Update(CCitadelPlayerPawn pawn, double nowMs) {
		while (In.Shots.Count > 0) In.Shots.Dequeue(); // Einzelklicks sind hier egal; gezaehlt wird "gehalten".

		double elapsed = nowMs - _startMs;
		double dt = Math.Clamp(nowMs - _lastMs, 0, 100);
		_lastMs = nowMs;

		var eye = Aim.Eye(pawn);
		var fwd = Aim.Forward(pawn.EyeAngles);
		var feet = FeetAt(elapsed / 1000.0);
		float scale = Scale();
		var pos = feet + new Vector3(0, 0, TrainerConfig.CenterZ * scale);
		float dist = Vector3.Distance(eye, pos);
		bool on = Aim.AngleTo(eye, fwd, pos) <= Aim.AngularRadius(26f * scale * 0.9f, dist);

		_total += dt;
		if (on) _onTarget += dt;
		if (In.AttackHeld) { _firing += dt; if (on) _firingOn += dt; }

		MoveBody(_body, feet, pawn.Position);
		if (_fallbackText != null) Face(_fallbackText, pos, eye);

		if (on != _wasOn) {
			_wasOn = on;
			if (on) { Tint(_body, 60, 255, 90); _fallbackText?.SetColor(60, 255, 90); }
			else { Tint(_body, 255, 60, 60); _fallbackText?.SetColor(255, 40, 40); }
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
