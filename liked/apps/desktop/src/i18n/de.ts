/** Alle Oberflächentexte zentral – Grundlage für spätere Übersetzungen. */
export const de = {
  appName: 'LIKED',
  tagline: 'Aus wessen Likes stammt dieser Clip?',
  common: {
    back: 'Zurück',
    close: 'Schließen',
    cancel: 'Abbrechen',
    confirm: 'Bestätigen',
    retry: 'Erneut versuchen',
    copy: 'Kopieren',
    copied: 'Kopiert',
    demo: 'DEMO',
    on: 'An',
    off: 'Aus',
    seconds: (n: number) => `${n} s`,
    you: 'Du'
  },
  menu: {
    create: 'Raum erstellen',
    join: 'Raum beitreten',
    settings: 'Einstellungen',
    howTo: "So funktioniert's",
    quit: 'Beenden',
    tiktok: 'TikTok',
    createTitle: 'Neuen Raum erstellen',
    modeTikTok: 'Mit TikTok-Likes',
    modeTikTokHint: 'Echte, importierte Likes aller Spieler.',
    modeDemo: 'Demo-Partie (Testdaten)',
    modeDemoHint: 'Zum Ausprobieren. Keine echten Likes – deutlich als Demo gekennzeichnet.',
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
    hint: 'Kein Konto, kein Passwort. Dein Profil bleibt auf diesem PC.'
  },
  tiktok: {
    title: 'TikTok-Verbindung',
    states: {
      disconnected: 'Nicht verbunden',
      authorizing: 'Anmeldung läuft …',
      connected_no_likes: 'Verbunden – Likes noch nicht verfügbar',
      syncing: 'Synchronisierung läuft',
      ready: 'Bereit',
      expired: 'Verbindung abgelaufen',
      error: 'Fehler',
      unsupported: 'Nicht unterstützt'
    } as Record<string, string>,
    stages: {
      requesting: 'Anfrage wird gestellt',
      preparing: 'TikTok bereitet deine Daten vor',
      downloading: 'Daten werden geladen',
      extracting: 'Likes werden ausgelesen',
      collecting: 'Sichtbare Likes werden gesammelt'
    } as Record<string, string>,
    connect: 'TikTok verbinden',
    reconnect: 'Erneut anmelden',
    sync: 'Likes synchronisieren',
    resync: 'Erneut synchronisieren',
    cancelSync: 'Synchronisierung abbrechen',
    disconnect: 'Verbindung trennen',
    disconnectConfirm: 'Verbindung trennen? Gespeicherte Zugangsdaten und importierte Likes werden von diesem PC und vom Server entfernt.',
    clips: (n: number) => `${n} Clips verfügbar`,
    lastSync: (d: string) => `Letzte erfolgreiche Synchronisierung: ${d}`,
    noSyncYet: 'Noch keine erfolgreiche Synchronisierung',
    preparingHint:
      'Die Bereitstellung durch TikTok erfolgt asynchron und kann von Minuten bis zu mehreren Tagen dauern. Du kannst LIKED schließen – der Status wird beim nächsten Start abgefragt.',
    nextCheck: (d: string) => `Nächste Prüfung: ${d}`,
    browserHint: 'Die Anmeldung öffnet sich in deinem Browser direkt bei TikTok. LIKED sieht dein Passwort nie.',
    unsupported: {
      adapter_unavailable:
        'Der offizielle TikTok-Import ist auf diesem Server nicht eingerichtet: Es fehlt eine von TikTok freigegebene App (Login Kit + Data Portability API).',
      not_approved: 'TikTok hat die Berechtigung für Aktivitätsdaten (Likes) nicht erteilt.',
      region: 'Dein Account oder deine Region wird von der TikTok-Datenübertragung nicht unterstützt (laut TikTok: EWR und Vereinigtes Königreich).',
      experimental_disabled: 'Der experimentelle Web-Import ist in den Einstellungen deaktiviert.'
    } as Record<string, string>,
    keptOldData: 'Deine zuletzt erfolgreich importierten Likes bleiben verfügbar.',
    official: 'Offizieller Import (TikTok Data Portability)',
    experimental: 'Experimenteller Web-Import',
    experimentalWarn:
      'Experimentell und NICHT verifiziert: Liest sichtbare Links deines „Gefällt mir“-Reiters in einer separaten TikTok-Ansicht, in der du dich selbst anmeldest. Nicht offiziell unterstützt, kann jederzeit brechen. Keine Umgehung von Captchas oder Sperren.',
    experimentalCollect: 'Öffne in der TikTok-Ansicht dein Profil → Reiter „Gefällt mir“ und scrolle, bis genug Clips gefunden wurden.',
    experimentalFound: (n: number) => `${n} Links gefunden`,
    experimentalCommit: 'Gefundene Likes übernehmen',
    proofTitle: 'Integrationsnachweis',
    proofHint: 'Zeigt die ersten importierten Like-IDs zum Abgleich mit deiner echten Like-Liste und spielt sie testweise ab.',
    proofPlay: 'Abspielen',
    manageClips: 'Clips verwalten',
    manageHint: 'Standardmäßig wählt LIKED automatisch. Hier kannst du einzelne Clips privat ausschließen.',
    excluded: 'Ausgeschlossen',
    include: 'Wieder zulassen',
    exclude: 'Ausschließen',
    serverUnknown: 'Server nicht erreichbar – Status unbekannt.'
  },
  lobby: {
    code: 'Raumcode',
    copyLink: 'Beitrittslink kopieren',
    players: (n: number, max: number) => `Spieler ${n}/${max}`,
    host: 'Host',
    ready: 'Bereit',
    notReady: 'Nicht bereit',
    makeReady: 'Ich bin bereit',
    unready: 'Doch nicht bereit',
    waitingSlot: 'Wartet auf Spieler …',
    kick: 'Entfernen',
    clipsPerPerson: 'Clips pro Person',
    answerTime: 'Antwortzeit',
    start: 'Partie starten',
    leave: 'Raum verlassen',
    rounds: (n: number) => `${n} gewertete Runden`,
    poolOk: 'Genug Clips',
    poolMissing: 'Keine Clips',
    poolInsufficient: 'Zu wenige Clips',
    mediaCheck: 'Ton & Video testen',
    mediaChecked: 'Ton & Video geprüft',
    mediaCheckTitle: 'Kurzer Medientest',
    mediaCheckHint: 'Hörst du den Ton und siehst du das Testvideo? Dieser Klick schaltet auch die Wiedergabe mit Ton frei.',
    mediaYes: 'Ja, funktioniert',
    mediaNo: 'Nein',
    disconnected: 'Verbindung getrennt',
    waitingNext: 'Wartet auf nächste Lobby',
    demoBadge: 'DEMO-PARTIE – Testdaten, keine echten Likes',
    consent: (n: number) =>
      `Beim Spielen werden ${n} deiner gelikten Clips und die Zuordnung zu dir dieser Lobby gezeigt. Einzelne Clips kannst du unter Einstellungen → Clips verwalten ausschließen.`,
    blockers: {
      too_few_players: (have: number, need: number) => `Mindestens ${need} Spieler nötig (aktuell ${have}).`,
      not_ready: (names: string) => `Noch nicht bereit: ${names}`,
      pool_missing: (names: string) => `Keine Clips übermittelt: ${names}`,
      pool_insufficient: (names: string, need: number) =>
        `Zu wenige verfügbare Clips (mind. ${need} nach Ausschluss von Überschneidungen): ${names} – erneut synchronisieren oder weniger Clips pro Person wählen.`,
      media_unchecked: (names: string) => `Medientest fehlt: ${names}`,
      disconnected: (names: string) => `Getrennt: ${names}`
    },
    poolError: {
      no_data: 'Keine importierten Likes vorhanden. Verbinde und synchronisiere TikTok in den Einstellungen.',
      not_ready: 'Deine Likes sind noch nicht bereit.'
    } as Record<string, string>,
    reactions: 'Reaktionen'
  },
  round: {
    question: 'Aus wessen Likes stammt dieser Clip?',
    preparing: 'Clip wird geladen …',
    retrying: 'Neuer Ladeversuch …',
    getReady: 'Gleich geht’s los',
    yourClip: 'Dein Clip – diese Runde schaust du zu',
    sent: 'Tipp gesendet …',
    confirmed: 'Tipp bestätigt',
    tooLate: 'Zu spät – nicht gewertet',
    notConfirmed: 'Keine Bestätigung – erneuter Versuch …',
    votesIn: (n: number, of: number) => `${n}/${of} Tipps abgegeben`,
    round: (n: number, of: number) => `Runde ${n}/${of}`,
    timeUp: 'Zeit abgelaufen',
    keyHint: 'Tasten 1–9 wählen eine Karte',
    playerError: 'Clip kann nicht abgespielt werden',
    unmuteHint: 'Lautstärke über den Regler im Player'
  },
  reveal: {
    suspense: 'Und der Clip stammt von …',
    itWas: 'Das war …',
    correct: 'Richtig',
    wrong: 'Falsch',
    noVote: 'Kein Tipp',
    rank: (r: number) => `#${r}`,
    streak: (n: number) => `${n}er-Serie`,
    points: (n: number) => `+${n}`
  },
  scoreboard: {
    title: 'Zwischenstand',
    pause: 'Pause',
    resume: 'Weiter',
    paused: 'Pausiert vom Host',
    next: 'Nächste Runde gleich …'
  },
  results: {
    title: 'Finale',
    points: 'Punkte',
    correct: 'Richtig',
    longestStreak: 'Längste Serie',
    firstCorrect: 'Erste richtige',
    rematch: 'Revanche',
    toLobby: 'Zur Lobby',
    mainMenu: 'Hauptmenü',
    hostDecides: 'Der Host startet Revanche oder Lobby.',
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
    round_voided: 'Runde annulliert (Wiedergabeproblem) – keine Wertung, neuer Clip derselben Quelle.',
    clip_replaced: 'Clip nicht abspielbar – Ersatzclip derselben Quelle.',
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
    serverUnreachable: 'Server nicht erreichbar. Prüfe die Server-Adresse in den Einstellungen.',
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
  settings: {
    title: 'Einstellungen',
    tabs: { profile: 'Profil', tiktok: 'TikTok', display: 'Anzeige', audio: 'Audio', network: 'Server', about: 'Über & Updates' },
    fullscreen: 'Vollbild',
    reducedMotion: 'Reduzierte Bewegung',
    reducedMotionOptions: { system: 'Wie Windows', on: 'An', off: 'Aus' },
    effects: 'Effektqualität',
    effectsOptions: { high: 'Hoch', low: 'Niedrig' },
    gameAudio: 'Spielaudio',
    music: 'Spielmusik',
    sfx: 'Effekte',
    mute: 'Stumm',
    videoAudio: 'Videoaudio',
    videoAudioHint:
      'Die Lautstärke von TikTok-Clips stellst du mit dem Regler direkt im TikTok-Player ein. Eine programmgesteuerte Lautstärke bietet der offizielle Player nicht; „Spielaudio“ betrifft nur Musik und Effekte von LIKED.',
    videoStartMuted: 'Clips stumm starten',
    serverUrl: 'Server-Adresse',
    serverHint: 'Alle Mitspieler müssen denselben Server verwenden.',
    serverDefault: 'Standard-Server von LIKED – automatisch eingerichtet, nichts einzutragen.',
    serverCustom: 'Eigener Server gewählt. Alle Mitspieler müssen denselben Server verwenden.',
    useDefaultServer: 'Standard-Server verwenden',
    localHost: 'Lokaler Server (fortgeschritten)',
    localHostHint:
      'Startet den Spielserver auf diesem PC. Mitspieler außerhalb deines Netzes brauchen Portweiterleitung oder ein VPN. Der offizielle TikTok-Import ist im lokalen Modus nicht verfügbar.',
    localStart: 'Lokalen Server starten',
    localStop: 'Lokalen Server stoppen',
    localAddresses: 'Erreichbar unter',
    useLocal: 'Diesen Server verwenden',
    wipe: 'Lokale Spieldaten löschen',
    wipeConfirm:
      'Alle lokalen Spieldaten löschen? Importierte Likes, Ausschlüsse, Verlauf und die TikTok-Verbindung werden entfernt. Das kann nicht rückgängig gemacht werden.',
    experimentalToggle: 'Experimentellen Web-Import erlauben',
    version: (v: string) => `Version ${v}`,
    checkUpdates: 'Nach Updates suchen',
    downloadUpdate: 'Update herunterladen',
    installOnQuit: 'Beim nächsten Beenden installieren',
    updateStates: {
      idle: '',
      checking: 'Suche nach Updates …',
      none: 'LIKED ist aktuell.',
      available: 'Update verfügbar',
      downloading: 'Wird heruntergeladen …',
      ready: 'Update bereit – wird beim Beenden installiert.',
      error: 'Update-Prüfung fehlgeschlagen',
      unsupported: 'Updates nur in der installierten Version.'
    } as Record<string, string>,
    updateNoMatch: 'Updates werden nie während einer Partie installiert.',
    licenses: 'Grafik und Sounds sind selbst erstellt; Schriften: Unbounded & Inter (SIL Open Font License).'
  },
  intro: {
    skip: 'Überspringen',
    next: 'Weiter',
    done: 'Los geht’s',
    slides: [
      { title: 'Verbinde TikTok', text: 'LIKED importiert automatisch deine gelikten Videos. Dein Passwort gibst du nur bei TikTok ein.' },
      { title: 'Clips aller mischen', text: 'Jede Person steuert gleich viele Clips bei. Ihr seht sie gemeinsam – jeder an seinem PC.' },
      { title: 'Wer hat’s gelikt?', text: 'Tippe so schnell wie möglich. Schnelle richtige Tipps bringen mehr Punkte, Serien geben Bonus.' }
    ]
  }
} as const;

export type Texts = typeof de;
export const t = de;
