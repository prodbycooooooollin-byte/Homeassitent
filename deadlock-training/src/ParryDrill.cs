using System.Numerics;
using DeadworksManaged.Api;

namespace DeadlockTrainer;

enum ParryMode { Single, Multi, Burst }

/// <summary>
/// Parry-Training gegen Bots. Im echten Modus holt ein Bot-Held tatsaechlich zum Nahkampfschlag aus (Engine-Melee);
/// ausgewertet wird, ob dein Parry den Schlag abgefangen hat (ParrySuccess) oder du getroffen wurdest (Schaden wird
/// dabei blockiert, du stirbst nicht). Klappt der Bot-Schlag nicht, schaltet die Uebung auf eine Simulation um
/// (Zeitfenster-Auswertung mit Text-Signalen).
/// </summary>
sealed class ParryDrill : Drill {
	private enum Ph { Gap, Telegraph, Await }

	private readonly ParryMode _mode;
	private readonly int _total;           // Anzahl Schlaege insgesamt
	private readonly int _burstSize;
	private int _done;                     // abgeschlossene Schlaege
	private int _burstLeft;
	private Ph _ph = Ph.Gap;
	private double _nextAt;

	private readonly List<float> _offs = new();   // Winkel der Angreifer relativ zur Blickrichtung zu Beginn
	private float _baseYaw;
	private float _radius;
	private int _cur = -1, _last = -1;

	// aktuelle Runde
	private double _roundStart, _triggerAt, _deadline;
	private bool _realRound;
	private double _evParry = -1, _evHit = -1, _evMelee = -1, _evStart = -1, _firstEv = -1, _outcomeAt = -1;
	private CPointWorldText? _cue;
	// Simulation
	private double _strikeAt;
	private bool _sampled, _activeAtStrike;
	private readonly List<double> _simEdges = new();
	private int _edgeSeen;

	private bool _realBroken;
	private int _noAttackStreak;

	// Statistik
	private int _ok, _early, _late, _missed, _derived;
	private readonly List<double> _offsets = new();
	private readonly List<double> _reactions = new();

	public override string Name => "Parry";

	public ParryDrill(CCitadelPlayerController ctl, PlayerInput input, Level lvl, ParryMode mode, int rounds)
		: base(ctl, input, lvl) {
		_mode = mode;
		_burstSize = mode == ParryMode.Burst ? Tuning.ParryBurstSize(lvl) : 1;
		_total = Math.Clamp(rounds, 1, 60) * _burstSize;
	}

	private int AttackerCount => _mode == ParryMode.Single ? 1 : 3;

	protected override void Begin(CCitadelPlayerPawn pawn, double nowMs) {
		_baseYaw = pawn.EyeAngles.Y;
		_radius = _mode == ParryMode.Single ? 135f : 165f;
		int n = AttackerCount;
		for (int i = 0; i < n; i++) {
			float frac = n == 1 ? 0.5f : i / (float)(n - 1);
			float off = n == 1 ? 0f : -48f + frac * 96f;
			_offs.Add(off);
			AddActor(pawn, HomeFor(pawn.Position, i), nowMs);
		}
	}

	private Vector3 HomeFor(Vector3 playerFeet, int i) =>
		new Vector3(playerFeet.X, playerFeet.Y, playerFeet.Z) + Aim.Forward(0f, _baseYaw + _offs[i]) * _radius;

	protected override void Ready(CCitadelPlayerPawn pawn, double nowMs) {
		_nextAt = nowMs + 2500;
		_edgeSeen = In.ParryEdges;
		var eye = Aim.Eye(pawn);

		if (!RealBots) {
			// Marker fuer die Angreifer, damit man sieht, wo sie stehen.
			for (int i = 0; i < Actors.Count; i++)
				Actors[i].Marker = SpawnText("O", HomeFor(pawn.Position, i) + new Vector3(0, 0, TrainerConfig.CenterZ), eye, 22f, 150, 150, 150);
		}

		string modeText = _mode switch {
			ParryMode.Single => "Einzel (1 Angreifer)",
			ParryMode.Multi => "Mehrere (3 Angreifer, zufaellige Reihenfolge)",
			_ => $"Salve ({_burstSize} Schlaege hintereinander)"
		};
		Say($"[Parry] {modeText}, Stufe {LevelParse.Label(Lvl)}, {_total} Schlaege.");
		if (RealBots) {
			Say("[Parry] Die Bots schlagen wirklich zu. Parry im richtigen Moment (Standard-Taste) - dein Parry wird von der Engine ausgewertet.");
			double tg = Tuning.ParryTelegraphMs(Lvl);
			if (tg > 0) Say("[Parry] Rotes '>>' ueber dem Kopf = gleich holt er aus (nur auf leicht/normal).");
			else Say("[Parry] Schwer: keine Vorwarnung - lies die Animation.");
		} else {
			Say("[Parry] Vereinfachter Modus: Rotes '>> <<' = gleich kommt ein Schlag ('!!!' = jetzt). Parry so, dass dein Fenster den Schlag abdeckt.");
		}
		Say("[Parry] Abbrechen: !tstop");
	}

	// ---- Ereignisse ------------------------------------------------------------------------------------------------

	public override void OnModifier(ModifierEvent e) {
		if (_ph != Ph.Await) return;
		var player = PlayerPawn;
		if (player == null) return;
		double now = Clock.Ms;
		bool playerInvolved = e.Caster?.EntityHandle == player.EntityHandle || e.Target?.EntityHandle == player.EntityHandle;
		bool botCaster = ActorOf(e.Caster) != null;

		switch (e.Event) {
			case EModifierEvent.ParrySuccess when playerInvolved:
				if (_evParry < 0) _evParry = now;
				_outcomeAt = _outcomeAt < 0 ? now : _outcomeAt;
				Touch(now);
				break;
			case EModifierEvent.MeleeAttack when botCaster:
				if (_evMelee < 0) _evMelee = now;
				Touch(now);
				break;
			case EModifierEvent.MeleeAttackStarted when botCaster:
				if (_evStart < 0) _evStart = now;
				Touch(now);
				break;
		}
	}

	public override HookResult OnTakeDamage(TakeDamageEvent e) {
		// Bots duerfen dich in dieser Uebung nicht verletzen: Schaden blocken, aber als "getroffen" werten.
		if (IsPlayer(e.Entity) && (ActorOf(e.Info.Attacker) != null || ActorOf(e.Info.Inflictor) != null)) {
			if (_ph == Ph.Await && _evHit < 0) {
				double now = Clock.Ms;
				_evHit = now;
				_outcomeAt = _outcomeAt < 0 ? now : _outcomeAt;
				Touch(now);
			}
			return HookResult.Stop;
		}
		// Bots sollen nicht sterben.
		if (ActorOf(e.Entity) is { } bot && bot.Pawn is { } bp && bp.Health - e.Info.Damage <= 50)
			bp.Health = bp.MaxHealth;
		return HookResult.Continue;
	}

	private void Touch(double now) { if (_firstEv < 0) _firstEv = now; }

	// ---- Ablauf ----------------------------------------------------------------------------------------------------

	protected override void Tick(CCitadelPlayerPawn pawn, double nowMs) {
		var player = pawn.Position;
		var eye = Aim.Eye(pawn);

		// Alle Angreifer stehen im Kreis um den Spieler und schauen ihn an.
		for (int i = 0; i < Actors.Count; i++)
			PlaceActor(Actors[i], HomeFor(player, i), player, eye, TrainerConfig.CenterZ);

		if (In.ParryEdges != _edgeSeen) {
			_edgeSeen = In.ParryEdges;
			if (_ph != Ph.Gap && !_realRound) _simEdges.Add(In.LastParryEdgeMs);
		}

		switch (_ph) {
			case Ph.Gap:
				if (nowMs >= _nextAt) StartRound(pawn, nowMs, eye);
				break;
			case Ph.Telegraph:
				KeepCue(eye);
				if (nowMs >= _triggerAt) Trigger(pawn, nowMs);
				break;
			case Ph.Await:
				KeepCue(eye);
				if (_realRound) AwaitReal(nowMs);
				else AwaitSim(pawn, nowMs);
				break;
		}
	}

	private Vector3 CuePos() {
		var a = Actors[_cur];
		return a.Feet + new Vector3(0, 0, RealBots ? 155f : TrainerConfig.CenterZ + 55f);
	}

	private void KeepCue(Vector3 eye) {
		if (_cue != null) Face(_cue, CuePos(), eye);
	}

	private void SetCue(string text, byte r, byte g, byte b, Vector3 eye) {
		if (_cue == null) _cue = SpawnText(text, CuePos(), eye, 20f, r, g, b);
		else { _cue.SetMessage(text); _cue.SetColor(r, g, b); }
	}

	private void ClearCue() {
		Kill(_cue);
		_cue = null;
	}

	private void StartRound(CCitadelPlayerPawn pawn, double nowMs, Vector3 eye) {
		do { _cur = Rng.Next(Actors.Count); } while (Actors.Count > 1 && _cur == _last);
		_last = _cur;

		_realRound = RealBots && !_realBroken && Actors[_cur].BotReady;
		_roundStart = nowMs;
		_evParry = _evHit = _evMelee = _evStart = _firstEv = _outcomeAt = -1;
		_simEdges.Clear();
		_edgeSeen = In.ParryEdges;
		_sampled = false;
		_activeAtStrike = false;

		if (_realRound) {
			double tg = Tuning.ParryTelegraphMs(Lvl);
			_triggerAt = nowMs + Math.Max(tg, 200);
			if (tg > 0) SetCue(">>", 255, 50, 50, eye);
		} else {
			double wind = Tuning.ParrySimWindupMs(Lvl, Rng);
			_triggerAt = nowMs;
			_strikeAt = nowMs + wind;
			SetCue(">>   <<", 255, 50, 50, eye);
		}
		_ph = Ph.Telegraph;
	}

	private void Trigger(CCitadelPlayerPawn pawn, double nowMs) {
		_ph = Ph.Await;
		if (_realRound) {
			var bot = Actors[_cur].Pawn;
			int rc = -99;
			try { if (bot != null) rc = bot.ExecuteAbilityBySlot(EAbilitySlot.WeaponMelee); }
			catch (Exception ex) { Console.WriteLine($"[Trainer] Bot-Melee fehlgeschlagen: {ex.Message}"); }
			Console.WriteLine($"[Trainer] Parry-Runde {_done + 1}: Bot-Melee rc={rc}");
			_deadline = nowMs + 1700;
		} else {
			_deadline = _strikeAt + 450;
		}
	}

	// ---- Auswertung: echter Bot ------------------------------------------------------------------------------------

	private void AwaitReal(double nowMs) {
		bool settled =
			(_outcomeAt >= 0 && nowMs >= _outcomeAt + 220) ||
			(_firstEv >= 0 && nowMs >= _firstEv + 750) ||
			nowMs >= _deadline;
		if (settled) FinishReal(nowMs);
	}

	private void FinishReal(double nowMs) {
		ClearCue();
		bool anyEvent = _evParry >= 0 || _evHit >= 0 || _evMelee >= 0 || _evStart >= 0;
		if (!anyEvent) {
			_noAttackStreak++;
			if (_noAttackStreak >= 2) {
				_realBroken = true;
				Say("[Parry] Der Bot-Schlag kommt nicht an (kein Nahkampf-Ereignis). Ich schalte auf die einfache Simulation um. Mehr dazu: !tbot test");
			} else {
				Say("[Parry] Der Bot hat nicht zugeschlagen - Runde wird wiederholt.");
			}
			_nextAt = nowMs + 1200;
			_ph = Ph.Gap;
			return;
		}
		_noAttackStreak = 0;

		string head = $"[Parry {_done + 1}/{_total}]";
		bool parried = _evParry >= 0 || (_evHit < 0);
		double tHit = _evParry >= 0 ? _evParry : _evHit >= 0 ? _evHit : _evMelee >= 0 ? _evMelee : _evStart + 300;
		bool derived = _evParry < 0 && _evHit < 0;

		var edges = In.ParryEdgeTimes;
		double? before = null, after = null;
		foreach (var t in edges) {
			if (t < _roundStart - 100) continue;
			if (t <= tHit + 30) before = t;
			else if (after == null && t <= tHit + 600) after = t;
		}

		if (parried) {
			_ok++;
			if (derived) _derived++;
			string tail = derived ? " (abgeleitet: Bot hat geschlagen, du wurdest nicht getroffen)" : "";
			if (before != null) {
				double off = before.Value - tHit;
				_offsets.Add(off);
				_reactions.Add(before.Value - _roundStart);
				string where = off < -90 ? "frueh" : off > 20 ? "spaet" : "gut";
				Say($"{head} PARRY! Druck {Fmt.Signed(off)} zum Treffer ({where}){tail}");
			} else {
				Say($"{head} PARRY!{tail}");
			}
		} else {
			if (before != null) {
				_early++;
				Say($"{head} GETROFFEN - zu frueh: {Fmt.Ms(tHit - before.Value)} vor dem Treffer gedrueckt, das Fenster war schon zu.");
			} else if (after != null) {
				_late++;
				Say($"{head} GETROFFEN - zu spaet: {Fmt.Ms(after.Value - tHit)} nach dem Treffer gedrueckt.");
			} else {
				_missed++;
				Say($"{head} GETROFFEN - kein Parry gedrueckt.");
			}
		}
		AfterRound(nowMs);
	}

	// ---- Auswertung: Simulation ------------------------------------------------------------------------------------

	private void AwaitSim(CCitadelPlayerPawn pawn, double nowMs) {
		if (!_sampled && nowMs >= _strikeAt) {
			_sampled = true;
			_activeAtStrike = In.ParryActive;
			SetCue("!!!", 255, 255, 255, Aim.Eye(pawn));
			pawn.EmitSound("Damage.Send.Crit", volume: 0.5f);
		}
		if (_sampled && nowMs >= _strikeAt + 450) FinishSim(nowMs);
	}

	private void FinishSim(double nowMs) {
		ClearCue();
		double t = _strikeAt;
		string head = $"[Parry {_done + 1}/{_total}]";
		bool success = _activeAtStrike || _simEdges.Any(e => e >= t && e <= t + 40);
		if (success) {
			_ok++;
			double first = _simEdges.Count > 0 ? _simEdges[0] : t;
			double off = first - t;
			_offsets.Add(off);
			if (_simEdges.Count > 0) _reactions.Add(first - _roundStart);
			string where = off < -90 ? "frueh" : off > 20 ? "spaet" : "gut";
			Say($"{head} PARRY! Druck {Fmt.Signed(off)} zum Schlag ({where}) [Simulation]");
		} else if (_simEdges.Count > 0) {
			double e = _simEdges[^1];
			if (e > t) { _late++; Say($"{head} ZU SPAET: {Fmt.Ms(e - t)} nach dem Schlag. [Simulation]"); }
			else { _early++; Say($"{head} ZU FRUEH: {Fmt.Ms(t - e)} vor dem Schlag gedrueckt, Fenster war schon zu. [Simulation]"); }
		} else {
			_missed++;
			Say($"{head} VERPENNT - kein Parry. [Simulation]");
		}
		AfterRound(nowMs);
	}

	// ---- gemeinsam -------------------------------------------------------------------------------------------------

	private void AfterRound(double nowMs) {
		_done++;
		if (_done >= _total) {
			Summarize();
			Finished = true;
			return;
		}
		if (_mode == ParryMode.Burst) {
			if (_burstLeft <= 0) _burstLeft = _burstSize;
			_burstLeft--;
			if (_burstLeft > 0) {
				_nextAt = nowMs + Tuning.ParryBurstSpacingMs(Lvl, Rng);
				_ph = Ph.Gap;
				return;
			}
		}
		_nextAt = nowMs + Tuning.ParryGapMs(Lvl, Rng);
		_ph = Ph.Gap;
	}

	private void Summarize() {
		double rate = _total > 0 ? 100.0 * _ok / _total : 0;
		Say($"=== Parry fertig ({_mode}, {LevelParse.Label(Lvl)}) ===");
		Say($"Geparried: {_ok}/{_total} ({rate:0}%) | zu frueh {_early} | zu spaet {_late} | kein Parry {_missed}");
		if (_offsets.Count > 0)
			Say($"Ø Druckpunkt: {Fmt.Signed(_offsets.Average())} zum Treffer | Ø Reaktion ab Runden-Start: " +
				(_reactions.Count > 0 ? Fmt.Ms(_reactions.Average()) : "-"));
		if (_derived > 0) Say($"({_derived} Parries nur abgeleitet - Engine-Event 'ParrySuccess' kam nicht an.)");
		string key = $"parry_{_mode}_{Lvl}";
		bool best = Records.Submit(key, rate);
		Say(best ? $"Neuer Bestwert fuer diese Sitzung: {rate:0}%" : $"Bestwert diese Sitzung: {Records.Get(key):0}%");
		Ctl.HudAnnounce("PARRY FERTIG", $"{_ok}/{_total} ({rate:0}%)");
	}

	public override void Stop() {
		ClearCue();
		base.Stop();
	}
}
