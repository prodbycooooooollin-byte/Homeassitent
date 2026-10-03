/** Alle Oberflächentexte zentral – Grundlage für spätere Übersetzungen. */
const AVATAR_NAMES: Record<string, string> = {
  fox: 'Fuchs', owl: 'Eule', cat: 'Katze', frog: 'Frosch', panda: 'Panda', tiger: 'Tiger', koala: 'Koala', octopus: 'Oktopus',
  unicorn: 'Einhorn', alien: 'Alien', robot: 'Roboter', ghost: 'Geist', penguin: 'Pinguin', dragon: 'Drache', bee: 'Biene', shark: 'Hai'
};
const REACTION_NAMES: Record<string, string> = { '🔥': 'Feuer', '😂': 'Lachen', '😱': 'Schock', '👀': 'Augen', '💜': 'Herz', '👏': 'Applaus' };

export const de = {
  appName: 'LIKED',
  tagline: 'Aus wessen Likes stammt dieser Clip?',
  avatarName: (id: string) => AVATAR_NAMES[id] ?? id,
  reactionName: (e: string) => REACTION_NAMES[e] ?? e,
  common: {
    back: 'Zurück',
    close: 'Schließen',
    cancel: 'Abbrechen',
    confirm: 'Bestätigen',
    retry: 'Erneut versuchen',
    copy: 'Kopieren',
    copied: 'Kopiert',
    demo: 'Demo',
    on: 'An',
    off: 'Aus',
    edit: 'Bearbeiten',
    done: 'Fertig',
    save: 'Speichern',
    dismiss: 'Ausblenden',
    learnMore: 'Mehr erfahren',
    advanced: 'Erweitert',
    seconds: (n: number) => `${n} s`,
    you: 'Du',
    simulated: 'Simuliert'
  },
  menu: {
    create: 'Raum erstellen',
    createHint: 'Du bist Host und lädst Freunde per Code ein.',
    join: 'Raum beitreten',
    joinHint: 'Mit einem 6-stelligen Code oder Einladungslink.',
    solo: 'Allein ausprobieren',
    soloHint: 'Eine Proberunde mit zwei simulierten Mitspielern und Beispielclips – ohne TikTok, ohne Server.',
    settings: 'Einstellungen',
    howTo: 'Einführung',
    rules: 'Spielregeln',
    quit: 'Beenden',
    tiktok: 'TikTok',
    players: '3–8 Spieler · jeder an seinem eigenen PC',
    createTitle: 'Neuen Raum erstellen',
    modeTikTok: 'Mit TikTok-Likes',
    modeTikTokHint: 'Echte, importierte Likes aller Spieler.',
    modeDemo: 'Demo mit Freunden',
    modeDemoHint: 'Echte Mitspieler, aber Beispielclips statt Likes. Ideal zum Ausprobieren in der Gruppe.',
    modeSolo: 'Allein ausprobieren',
    modeSoloHint: 'Ohne Mitspieler: zwei simulierte Spieler machen mit.',
    joinTitle: 'Raum beitreten',
    codePlaceholder: 'CODE',
    joinButton: 'Beitreten',
    needName: 'Wähle zuerst einen Anzeigenamen.',
    needTikTok: 'Für diesen Modus brauchst du importierte TikTok-Likes.'
  },
  profile: {
    title: 'Dein Spielprofil',
    name: 'Anzeigename',
    avatar: 'Avatar',
    autosave: 'Änderungen werden automatisch gespeichert.',
    saved: 'Gespeichert',
    hint: 'Kein Konto, kein Passwort. Dein Profil bleibt auf diesem PC.',
    namePlaceholder: 'z. B. Mia',
    noName: 'Noch kein Name gewählt',
    errors: {
      short: 'Mindestens 2 Zeichen.',
      long: 'Höchstens 20 Zeichen.',
      chars: 'Der Name enthält unzulässige Zeichen.'
    }
  },
  tiktok: {
    title: 'TikTok-Verbindung',
    states: {
      disconnected: 'Nicht verbunden',
      authorizing: 'Warte auf Bestätigung im Browser',
      connected_no_likes: 'Verbunden – noch keine Likes importiert',
      syncing: 'Import läuft',
      ready: 'Import abgeschlossen',
      expired: 'Anmeldung abgelaufen',
      error: 'Fehlgeschlagen',
      unsupported: 'Nicht verfügbar'
    } as Record<string, string>,
    syncingPrepare: 'Import wird vorbereitet',
    stages: {
      requesting: 'Anfrage an TikTok wird gestellt',
      preparing: 'TikTok stellt deine Daten zusammen',
      downloading: 'Daten werden heruntergeladen',
      extracting: 'Likes werden ausgelesen',
      collecting: 'Sichtbare Likes werden gesammelt'
    } as Record<string, string>,
    authorizingHint:
      'Im Browser hat sich die TikTok-Anmeldung geöffnet. Bestätige dort den Zugriff – LIKED erkennt das automatisch. Nach 10 Minuten ohne Bestätigung wird die Anmeldung abgebrochen.',
    reopenBrowser: 'Anmeldeseite erneut öffnen',
    cancelLogin: 'Anmeldung abbrechen',
    connect: 'TikTok verbinden',
    reconnect: 'Erneut anmelden',
    sync: 'Likes importieren',
    resync: 'Likes erneut importieren',
    cancelSync: 'Import abbrechen',
    disconnect: 'Verbindung trennen',
    disconnectConfirm: 'Verbindung trennen? Gespeicherte Zugangsdaten und importierte Likes werden von diesem PC und vom Server entfernt.',
    clips: (n: number) => `${n} Clips verfügbar`,
    lastSync: (d: string) => `Letzter erfolgreicher Import: ${d}`,
    noSyncYet: 'Noch kein erfolgreicher Import',
    preparingHint:
      'TikTok stellt die Daten zeitversetzt bereit – das kann Minuten bis Tage dauern. Du kannst LIKED schließen; der Status wird beim nächsten Start abgefragt.',
    nextCheck: (d: string) => `Nächste Statusabfrage: ${d}`,
    browserHint: 'Die Anmeldung öffnet sich in deinem Browser direkt bei TikTok. LIKED sieht dein Passwort nie.',
    errorCause: 'Ursache',
    expiredHint: 'Der Zugriff auf dein TikTok-Konto ist abgelaufen. Melde dich erneut an, um Likes zu importieren.',
    unsupported: {
      adapter_unavailable:
        'Der TikTok-Import ist auf dem LIKED-Server noch nicht freigeschaltet. Bis dahin kannst du mit Beispielclips spielen.',
      not_approved: 'TikTok hat die Berechtigung für deine Likes nicht erteilt.',
      region: 'Die TikTok-Datenübertragung ist laut TikTok nur für Konten aus dem EWR und dem Vereinigten Königreich verfügbar.',
      experimental_disabled: 'Der experimentelle Web-Import ist ausgeschaltet (Erweitert).'
    } as Record<string, string>,
    keptOldData: 'Deine zuletzt importierten Likes bleiben verfügbar.',
    official: 'Offizieller Import',
    experimental: 'Experimenteller Web-Import',
    experimentalWarn:
      'Nicht offiziell unterstützt und ungetestet: Liest sichtbare Links deines „Gefällt mir“-Reiters in einer separaten TikTok-Ansicht, in der du dich selbst anmeldest. Kann jederzeit nicht mehr funktionieren. Captchas oder Sperren werden nicht umgangen.',
    experimentalCollect: 'Öffne in der TikTok-Ansicht dein Profil → Reiter „Gefällt mir“ und scrolle, bis genug Clips gefunden wurden.',
    experimentalFound: (n: number) => `${n} Links gefunden`,
    experimentalCommit: 'Gefundene Likes übernehmen',
    proofTitle: 'Import prüfen',
    proofHint: 'Die ersten importierten Likes – zum Abgleich mit deiner Like-Liste in TikTok.',
    proofPlay: 'Abspielen',
    serverUnknown: 'Server nicht erreichbar – Status unbekannt.'
  },
  clips: {
    title: 'Meine Clips',
    intro: 'LIKED wählt für jede Partie automatisch Clips aus deinen importierten Likes. Hier kannst du einzelne Clips privat ausschließen – niemand sieht, welche.',
    available: 'Verfügbar',
    excluded: 'Ausgeschlossen',
    needed: 'Pro Partie benötigt',
    neededValue: (n: number) => `${n} (je nach Einstellung 5, 8 oder 10)`,
    notEnough: (have: number, need: number) =>
      `Nur ${have} Clips verfügbar – für ${need} Clips pro Person reicht das nicht. Lass ausgeschlossene Clips wieder zu, importiere erneut oder wähle weniger Clips pro Person.`,
    emptyTitle: 'Noch keine Likes importiert',
    emptyText: 'Verbinde TikTok und importiere deine Likes. Bis dahin kannst du mit Beispielclips spielen.',
    emptyAction: 'TikTok verbinden',
    soloAction: 'Allein ausprobieren',
    demoNote: 'In Demo-Partien werden Beispielclips verwendet – deine eigenen Likes sind dort nicht beteiligt.',
    include: 'Wieder zulassen',
    exclude: 'Ausschließen',
    view: 'Ansehen',
    stateExcluded: 'ausgeschlossen',
    stateIncluded: 'wird verwendet',
    shown: (n: number, of: number) => `${n} von ${of} neuesten Likes angezeigt`
  },
  lobby: {
    code: 'Raumcode',
    copyCode: 'Code kopieren',
    copyLink: 'Link kopieren',
    players: (n: number, max: number) => `Spieler ${n}/${max}`,
    host: 'Host',
    ready: 'Bereit',
    notReady: 'Nicht bereit',
    makeReady: 'Ich bin bereit',
    unready: 'Doch nicht bereit',
    kick: 'Entfernen',
    clipsPerPerson: 'Clips pro Person',
    answerTime: 'Antwortzeit',
    start: 'Partie starten',
    leave: 'Raum verlassen',
    leaveSolo: 'Demo beenden',
    backToLobby: 'Zurück zur Lobby',
    hostOnlySettings: 'Nur der Host kann die Einstellungen ändern.',
    roundsAt: (rounds: number, players: number, min: boolean) =>
      min ? `${rounds} Runden bei ${players} Spielern (Mindestanzahl)` : `${rounds} Runden bei ${players} Spielern`,
    duration: (a: number, b: number) => (a === b ? `ca. ${a} Min. (Schätzung)` : `ca. ${a}–${b} Min. (Schätzung)`),
    inviteNeed: (n: number) => (n === 1 ? 'Noch 1 Freund einladen' : `Noch ${n} Freunde einladen`),
    inviteMore: (n: number) => `Platz für ${n} weitere`,
    full: 'Raum ist voll',
    capacity: (max: number) => `max. ${max} Spieler`,
    poolOk: 'Clips bereit',
    poolMissing: 'Keine Clips',
    poolInsufficient: 'Zu wenige Clips',
    myClips: 'Meine Clips prüfen',
    mediaCheck: 'Ton & Bild testen',
    mediaRetest: 'Erneut testen',
    media: {
      untested: 'Ton & Bild noch nicht getestet',
      failed: 'Test nicht erfolgreich',
      ok: 'Ton & Bild funktionieren'
    },
    readyNeedsMedia: 'Vor „Bereit“ bitte kurz Ton & Bild testen.',
    readyNeedsPool: 'Dir fehlen noch passende Clips.',
    disconnected: 'Verbindung getrennt',
    waitingNext: 'Wartet auf nächste Lobby',
    soloBadge: 'Solo-Demo · Beispielclips',
    demoBadge: 'Demo · Beispielclips',
    tiktokBadge: 'TikTok-Likes',
    consentTikTok: (n: number) =>
      `Während der Partie werden ${n} deiner gelikten Clips und die Zuordnung zu dir den Mitspielern dieses Raums gezeigt.`,
    consentDemo: 'Ihr spielt mit Beispielclips. Eine TikTok-Verbindung ist nicht erforderlich.',
    consentSolo: 'Du spielst mit Beispielclips gegen zwei simulierte Mitspieler. Nichts davon wird hochgeladen.',
    blockersTitle: 'Bevor es losgehen kann',
    blockers: {
      too_few_players: (have: number, need: number) => `Mindestens ${need} Spieler nötig (aktuell ${have}).`,
      not_ready: (names: string) => `Noch nicht bereit: ${names}`,
      pool_missing: (names: string) => `Keine Clips übermittelt: ${names}`,
      pool_insufficient: (names: string, need: number) =>
        `Zu wenige Clips (mind. ${need} nach Ausschluss von Überschneidungen): ${names}`,
      media_unchecked: (names: string) => `Ton & Bild noch nicht getestet: ${names}`,
      disconnected: (names: string) => `Verbindung getrennt: ${names}`
    },
    blockerAction: {
      invite: 'Link kopieren',
      ready: 'Bereit melden',
      media: 'Jetzt testen',
      clips: 'Meine Clips prüfen',
      fewerClips: 'Weniger Clips pro Person'
    },
    poolError: {
      no_data: 'Du hast noch keine Likes importiert.',
      not_ready: 'Deine Likes sind noch nicht bereit.'
    } as Record<string, string>,
    reactions: 'Reaktionen',
    reactionLabel: (name: string) => `Reaktion senden: ${name}`,
    waitingForHost: 'Der Host startet die Partie, sobald alle bereit sind.'
  },
  mediaTest: {
    title: 'Ton & Bild testen',
    whatTiktok: 'Getestet wird die Wiedergabe mit einem deiner importierten TikTok-Clips im offiziellen TikTok-Player.',
    whatTiktokNoData:
      'Getestet werden Ton und Bild von LIKED auf deinem PC (Beispielanimation und Testton). Ob TikTok-Clips abspielen, zeigt sich erst in der ersten Runde.',
    whatDemo: 'Getestet werden Ton und Bild von LIKED mit einem Beispielclip – so, wie er gleich im Spiel erscheint.',
    question: 'Siehst du den Clip und hörst du den Ton?',
    playTone: 'Testton abspielen',
    yes: 'Ja, funktioniert',
    no: 'Nein, Problem',
    whichProblem: 'Was funktioniert nicht?',
    problems: { sound: 'Kein Ton', picture: 'Kein Bild', both: 'Beides nicht' } as Record<string, string>,
    tips: {
      sound: [
        'Prüfe die Windows-Lautstärke und ob LIKED im Lautstärkemixer stummgeschaltet ist.',
        'Prüfe unter Einstellungen → Audio, ob Effekte stummgeschaltet sind.',
        'Bei TikTok-Clips: Lautsprechersymbol im Player antippen.'
      ],
      picture: [
        'Warte ein paar Sekunden – der Player lädt beim ersten Mal etwas länger.',
        'Klicke auf „Erneut testen“, um den Player neu zu laden.',
        'Prüfe deine Internetverbindung, falls TikTok-Clips nicht erscheinen.'
      ],
      both: [
        'Klicke auf „Erneut testen“, um den Player neu zu laden.',
        'Prüfe Internetverbindung und Windows-Lautstärke.',
        'Hilft das nicht, starte LIKED neu.'
      ]
    } as Record<string, string[]>,
    retest: 'Erneut testen',
    backToLobby: 'Zur Lobby',
    failedNote: 'Bis der Test klappt, kannst du dich nicht bereit melden.'
  },
  round: {
    question: 'Aus wessen Likes stammt dieser Clip?',
    questionDemo: 'Wer hat diesen Beispielclip „gelikt“?',
    preparing: 'Clip wird geladen …',
    retrying: 'Neuer Ladeversuch …',
    getReady: 'Gleich geht’s los',
    yourClip: 'Dein Clip – diese Runde schaust du zu',
    yourClipDemo: 'Dieser Beispielclip ist dir zugeordnet – diese Runde schaust du zu.',
    sent: 'Tipp gesendet …',
    confirmed: 'Tipp bestätigt',
    tooLate: 'Zu spät – nicht gewertet',
    notConfirmed: 'Keine Bestätigung – erneuter Versuch …',
    votesIn: (n: number, of: number) => `${n}/${of} Tipps abgegeben`,
    round: (n: number, of: number) => `Runde ${n}/${of}`,
    timeUp: 'Zeit abgelaufen',
    keyHint: 'Tasten 1–9 wählen eine Karte',
    playerError: 'Clip kann nicht abgespielt werden',
    unmuteHint: 'Lautstärke über den Regler im Player',
    leave: 'Partie verlassen',
    leaveConfirm: 'Partie wirklich verlassen?',
    leaveText:
      'Wenn du gehst, endet die Partie für alle: Der laufende Block wird zurückgesetzt und die Partie mit den abgeschlossenen Blöcken ausgewertet. Ist noch kein Block fertig, geht es für die anderen zurück in die Lobby.',
    leaveSoloText: 'Die Demo wird beendet und du kehrst zum Hauptmenü zurück.',
    stay: 'Weiterspielen'
  },
  reveal: {
    suspense: 'Und der Clip stammt von …',
    itWas: 'Das war …',
    correct: 'Richtig',
    wrong: 'Falsch',
    noVote: 'Kein Tipp',
    rank: (r: number) => `#${r}`,
    streak: (n: number) => `${n}er-Serie`,
    points: (n: number) => `+${n.toLocaleString('de-DE')}`
  },
  scoreboard: {
    title: 'Zwischenstand',
    pause: 'Pause',
    resume: 'Weiter',
    paused: 'Pausiert vom Host',
    next: 'Nächste Runde gleich …'
  },
  results: {
    title: 'Endergebnis',
    ranking: 'Rangliste',
    yourStats: 'Deine Werte',
    titlesHead: 'Titel',
    player: 'Spieler',
    points: 'Punkte',
    correct: 'Richtig',
    longestStreak: 'Längste Serie',
    firstCorrect: 'Als Erste(r) richtig',
    rematch: 'Revanche',
    soloAgain: 'Nochmal spielen',
    toLobby: 'Zur Lobby',
    mainMenu: 'Hauptmenü',
    hostDecides: 'Der Host startet Revanche oder Lobby.',
    soloDone: 'Das war die Demo. Spiel jetzt mit Freunden – mit Beispielclips oder euren TikTok-Likes.',
    place: (p: number) => `${p}.`,
    endReason: {
      complete: '',
      player_left: 'Vorzeitig ausgewertet: Ein Spieler hat die Partie verlassen. Der unvollständige Block wurde zurückgesetzt.',
      pool_exhausted: 'Vorzeitig ausgewertet: Es standen keine abspielbaren Ersatzclips mehr zur Verfügung.'
    } as Record<string, string>,
    titles: {
      menschenkenner: { name: 'Menschenkenner', rule: 'Meiste richtige Antworten' },
      blitzrater: { name: 'Blitzrater', rule: 'Am häufigsten als Erste(r) richtig' },
      serientaeter: { name: 'Serientäter', rule: 'Längste Serie (mind. 3)' }
    } as Record<string, { name: string; rule: string }>
  },
  notices: {
    round_voided: 'Runde annulliert (Wiedergabeproblem) – keine Wertung, neuer Clip derselben Person.',
    clip_replaced: 'Clip nicht abspielbar – Ersatzclip derselben Person.',
    match_aborted: 'Partie abgebrochen – noch kein Block abgeschlossen. Zurück in der Lobby.',
    host_changed: (n?: string) => `${n ?? 'Jemand'} ist jetzt Host.`,
    player_left: (n?: string) => `${n ?? 'Ein Spieler'} hat den Raum verlassen.`,
    rolled_back: 'Der unvollständige Block wurde vollständig zurückgesetzt.'
  },
  connection: {
    lost: 'Verbindung verloren',
    waking: 'Server wird gestartet – das kann beim ersten Verbinden bis zu einer Minute dauern …',
    reconnecting: (s: number) => `Verbinde neu … (${s} s)`,
    failed: 'Wiederverbindung fehlgeschlagen. Der Raum ist nicht mehr verfügbar.',
    serverUnreachable: 'Server nicht erreichbar. Bitte später erneut versuchen.',
    kicked: 'Du wurdest vom Host aus dem Raum entfernt.'
  },
  errors: {
    invalid_payload: 'Ungültige Eingabe.',
    rate_limited: 'Zu viele Anfragen – kurz warten.',
    room_not_found: 'Raum nicht gefunden. Code prüfen.',
    room_full: 'Der Raum ist voll (max. 8).',
    room_limit: 'Der Server ist ausgelastet.',
    wrong_phase: 'Gerade nicht möglich.',
    not_host: 'Nur der Host kann das.',
    not_in_room: 'Nicht in einem Raum.',
    invalid_token: 'Sitzung abgelaufen.',
    protocol_mismatch: 'Version passt nicht zum Server – bitte LIKED aktualisieren.',
    mode_mismatch: 'Deine Clips passen nicht zum Raummodus (Demo/TikTok).',
    round_mismatch: 'Diese Runde ist bereits vorbei.',
    not_eligible: 'Du setzt diese Runde aus.',
    invalid_target: 'Ungültige Auswahl.',
    too_late: 'Zu spät.',
    already_voted: 'Bereits abgestimmt.',
    cannot_start: 'Start noch nicht möglich.',
    network: 'Netzwerkfehler.'
  } as Record<string, string>,
  rules: {
    title: 'Spielregeln',
    intro: 'So funktioniert LIKED – genau so, wie das Spiel es berechnet.',
    sections: [
      {
        q: 'Worum geht es?',
        a: [
          'Jede Person steuert gleich viele Clips aus ihren gelikten TikTok-Videos bei. Die Partie läuft in Blöcken: In jedem Block kommt genau ein Clip von jeder Person, in gemischter Reihenfolge.',
          'Bei jedem Clip tippst du, aus wessen Likes er stammt. Pro Runde zählt genau ein Tipp – ein zweiter Klick ändert nichts.'
        ]
      },
      {
        q: 'Wie entstehen Punkte?',
        a: [
          'Nur richtige Tipps bringen Punkte. Wer am schnellsten richtig liegt, bekommt 1.000 Punkte; die weiteren richtigen Tipps bekommen weniger – bis 700 Punkte für den letzten möglichen Platz. Bei drei Ratenden also 1.000 / 850 / 700 Punkte (vor Serienbonus).',
          'Die Reihenfolge zählt nur unter den richtigen Tipps: Ein schneller falscher Tipp nimmt niemandem den ersten Platz weg. Tipps im selben 80-Millisekunden-Zeitfenster teilen sich den Platz.'
        ]
      },
      {
        q: 'Wie wirkt die Serie (Streak)?',
        a: [
          'Mehrere richtige Tipps hintereinander erhöhen deine Punkte: 2. Treffer in Folge ×1,05, 3. Treffer ×1,10, ab dem 4. ×1,15 (Obergrenze).',
          'Ein falscher Tipp oder kein Tipp setzt die Serie auf null.'
        ]
      },
      {
        q: 'Was passiert beim eigenen Clip?',
        a: ['Stammt der Clip aus deinen Likes, schaust du zu. Du bekommst keine Punkte, deine Serie bleibt aber unverändert. Die anderen sehen nicht, wer gerade aussetzt.']
      },
      {
        q: 'Was, wenn mehrere denselben Clip gelikt haben?',
        a: ['Solche Clips werden in der Partie nicht verwendet, damit jede Frage eindeutig bleibt. Erkannt wird das anhand der übermittelten Like-Listen – bei unvollständigen Importen nicht in jedem Fall.']
      },
      {
        q: 'Was passiert ohne Antwort?',
        a: ['Kein Tipp bis zum Ablauf der Zeit zählt wie ein falscher Tipp: 0 Punkte und die Serie beginnt von vorn.']
      },
      {
        q: 'Was, wenn ein Clip nicht abspielt?',
        a: [
          'Lädt ein Clip nicht, versucht LIKED es erneut und nimmt sonst einen Ersatzclip derselben Person.',
          'Startet die Wiedergabe bei jemandem deutlich zu spät oder bleibt sie länger hängen, wird die Runde neutral annulliert: keine Punkte, keine Änderung der Serie, keine Auflösung – danach folgt ein Ersatzclip derselben Person.'
        ]
      },
      {
        q: 'Was bei einer Verbindungsunterbrechung?',
        a: [
          'Du hast 30 Sekunden, um dich wieder zu verbinden; dein bereits abgegebener Tipp bleibt erhalten.',
          'Kommt jemand nicht zurück, wird der gerade laufende Block vollständig zurückgesetzt und die Partie mit den abgeschlossenen Blöcken ausgewertet. Ist noch kein Block fertig, geht es zurück in die Lobby. Verlässt der Host den Raum, übernimmt jemand anderes.'
        ]
      },
      {
        q: 'Wer gewinnt?',
        a: ['Entscheidend sind die Gesamtpunkte, danach die Zahl richtiger Antworten. Ist beides gleich, teilen sich die Spieler den Platz.']
      }
    ]
  },
  settings: {
    title: 'Einstellungen',
    tabs: { profile: 'Profil', tiktok: 'TikTok', clips: 'Meine Clips', display: 'Anzeige', audio: 'Audio', network: 'Server', about: 'Über & Updates' },
    theme: 'Erscheinungsbild',
    themeOptions: { dark: 'Dunkel', light: 'Hell', system: 'Wie Windows' },
    fullscreen: 'Vollbild',
    reducedMotion: 'Reduzierte Bewegung',
    reducedMotionHint: 'Schaltet Übergangsanimationen, bewegte Hintergründe und Partikel ab.',
    reducedMotionOptions: { system: 'Wie Windows', on: 'An', off: 'Aus' },
    effects: 'Hintergrundeffekte',
    effectsOptions: { high: 'An', low: 'Aus' },
    gameAudio: 'Musik & Effekte',
    music: 'Musik',
    sfx: 'Effekte',
    muteMusic: 'Musik stummschalten',
    muteSfx: 'Effekte stummschalten',
    videoAudio: 'Clip-Lautstärke',
    videoAudioHint: 'Die Lautstärke der Clips stellst du direkt im Player ein.',
    videoAudioMore:
      'Der offizielle TikTok-Player bietet keine Möglichkeit, die Lautstärke von außen zu setzen. Die Regler oben betreffen daher nur Musik und Effekte von LIKED.',
    videoStartMuted: 'Clips stumm starten',
    serverStatus: 'Verbindung',
    serverOnline: 'LIKED-Server erreichbar',
    serverOffline: 'LIKED-Server nicht erreichbar',
    serverChecking: 'Prüfe Server …',
    serverLocked: 'Solange du in einem Raum bist, kann der Server nicht gewechselt werden. Verlasse zuerst den Raum.',
    serverUrl: 'Eigene Server-Adresse',
    serverHint: 'Alle Mitspieler müssen denselben Server verwenden.',
    serverDefault: 'LIKED verbindet sich automatisch mit dem offiziellen LIKED-Server. Alle Spieler sind dort, es muss nichts eingestellt werden.',
    serverCustom: 'Eigener Server gewählt. Alle Mitspieler müssen denselben Server verwenden.',
    useDefaultServer: 'Standard-Server verwenden',
    localHost: 'Server auf diesem PC',
    localHostHint:
      'Startet den Spielserver auf diesem PC. Mitspieler außerhalb deines Netzes brauchen Portweiterleitung oder ein VPN. Der TikTok-Import ist dabei nicht verfügbar.',
    localStart: 'Lokalen Server starten',
    localStop: 'Lokalen Server stoppen',
    localAddresses: 'Erreichbar unter',
    useLocal: 'Diesen Server verwenden',
    saved: 'Gespeichert',
    wipe: 'Lokale Spieldaten löschen',
    wipeWhat: 'Gelöscht werden auf diesem PC:',
    wipeItems: [
      'deine importierte Like-Liste',
      'ausgeschlossene Clips',
      'der Verlauf bereits gespielter Clips',
      'die TikTok-Verbindung (Zugriff wird auch auf dem Server widerrufen)',
      'die Wiederverbindung zum letzten Raum'
    ],
    wipeKeep: 'Erhalten bleiben dein Profil und deine Einstellungen.',
    wipeConfirmTitle: 'Lokale Spieldaten endgültig löschen?',
    wipeConfirmButton: 'Endgültig löschen',
    wipeDone: 'Lokale Spieldaten gelöscht',
    experimentalToggle: 'Experimentellen Web-Import erlauben',
    version: (v: string) => `Version ${v}`,
    checkUpdates: 'Nach Updates suchen',
    downloadUpdate: 'Update herunterladen',
    installOnQuit: 'Beim nächsten Beenden installieren',
    updateStates: {
      idle: 'Noch nicht geprüft',
      checking: 'Suche nach Updates …',
      none: 'Aktuell – keine neuere Version verfügbar',
      available: 'Update verfügbar',
      downloading: 'Wird heruntergeladen …',
      ready: 'Update bereit – wird beim Beenden installiert',
      error: 'Prüfung fehlgeschlagen',
      unsupported: 'Updates gibt es nur in der installierten Version'
    } as Record<string, string>,
    updateNoMatch: 'Updates werden nie während einer Partie installiert.',
    licenses: 'Grafik und Sounds sind selbst erstellt; Schriften: Unbounded & Inter (SIL Open Font License).'
  },
  intro: {
    skip: 'Überspringen',
    next: 'Weiter',
    back: 'Zurück',
    done: 'Los geht’s',
    step: (i: number, n: number) => `Schritt ${i} von ${n}`,
    slides: [
      { title: 'Likes verbinden', text: 'Jede Person verbindet ihren TikTok-Account. LIKED importiert die gelikten Videos – dein Passwort gibst du nur bei TikTok ein.' },
      { title: 'Clip ansehen & tippen', text: 'Alle sehen gleichzeitig denselben Clip – jeder an seinem PC. Tippe auf die Person, von der du glaubst, dass sie den Clip gelikt hat.' },
      { title: 'Punkte & Serien', text: 'Schnelle richtige Tipps bringen mehr Punkte, Serien geben Bonus. Am Ende gewinnt, wer seine Freunde am besten kennt.' }
    ],
    finishTitle: 'Bereit?',
    finishText: 'Probier es zuerst allein aus oder erstelle direkt einen Raum für deine Freunde.'
  }
} as const;

export type Texts = typeof de;
export const t = de;
