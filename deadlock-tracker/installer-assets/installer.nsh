; Eigenes Erscheinungsbild für den Lockscope-Installer (Dunkel + Gold, deutsche Texte).
; Wird über build.nsis.include eingebunden; customHeader läuft vor dem Einfügen der Seiten.

!macro customHeader
  ; Dunkle Willkommens-/Abschlussseite und Kopfleiste
  !undef MUI_BGCOLOR
  !undef MUI_TEXTCOLOR
  !define MUI_BGCOLOR "07090E"
  !define MUI_TEXTCOLOR "E8ECF4"

  !define MUI_WELCOMEPAGE_TITLE "Willkommen bei Lockscope"
  !define MUI_WELCOMEPAGE_TEXT "Dein Match-Tracker für Deadlock.$\r$\n$\r$\nRatings von S bis F, Debrief nach jedem Match, Coach, Live-Ansicht und Aufstiegs-Prognose – alles an einem Ort.$\r$\n$\r$\nDie Installation dauert nur einen Moment."
  !define MUI_FINISHPAGE_TITLE "Alles bereit"
  !define MUI_FINISHPAGE_TEXT "Lockscope ist installiert.$\r$\n$\r$\nBeim ersten Start trägst du deine Steam-ID ein – danach erscheinen deine Matches automatisch.$\r$\n$\r$\nViel Erfolg in der nächsten Runde!"
  !define MUI_FINISHPAGE_RUN_TEXT "Lockscope jetzt starten"
  !define MUI_DIRECTORYPAGE_TEXT_TOP "Wähle den Ordner, in dem Lockscope installiert werden soll."

  ; Farbiger Fortschrittsbalken (Gold auf Dunkel) und Statuszeilen
  !define MUI_INSTFILES_PAGE_PROGRESSBAR "colored"
  InstallColors F0B44C 0B0E15

  BrandingText "Lockscope  ·  ${VERSION}"
!macroend

!macro customInstall
  DetailPrint "Lockscope ${VERSION} ist installiert."
  DetailPrint "Verknüpfungen angelegt – bereit zum Start."
!macroend

!macro customUnInstall
  DetailPrint "Lockscope wurde entfernt. Deine Matchdaten bleiben im Benutzerordner erhalten."
!macroend

; Vor der Installation: laufende Lockscope-Prozesse beenden, damit die alte Version nicht blockiert wird
!macro customInit
  nsExec::Exec 'taskkill /F /T /IM "Lockscope.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM "deadlock-api-ingest.exe"'
  Pop $0
  Sleep 1500
!macroend

; Scheitert das Entfernen der alten Version (z. B. Code 2: Datei noch gesperrt), nicht abbrechen:
; die neuen Dateien werden einfach über die alten kopiert.
!macro customUnInstallCheck
  ${if} $R0 != 0
    DetailPrint "Alte Version ließ sich nicht vollständig entfernen (Code $R0) – wird überschrieben."
  ${endif}
  ClearErrors
!macroend
!macro customUnInstallCheckCurrentUser
  ${if} $R0 != 0
    DetailPrint "Alte Version ließ sich nicht vollständig entfernen (Code $R0) – wird überschrieben."
  ${endif}
  ClearErrors
!macroend
