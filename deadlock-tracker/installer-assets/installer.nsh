; Eigenes Erscheinungsbild für den Deadlock-Tracker-Installer (Dunkel + Gold, deutsche Texte).
; Wird über build.nsis.include eingebunden; customHeader läuft vor dem Einfügen der Seiten.

!macro customHeader
  ; Dunkle Willkommens-/Abschlussseite und Kopfleiste
  !undef MUI_BGCOLOR
  !undef MUI_TEXTCOLOR
  !define MUI_BGCOLOR "07090E"
  !define MUI_TEXTCOLOR "E8ECF4"

  !define MUI_WELCOMEPAGE_TITLE "Willkommen beim Deadlock Tracker"
  !define MUI_WELCOMEPAGE_TEXT "Dein Match-Tracker für Deadlock.$\r$\n$\r$\nRatings von S bis F, Debrief nach jedem Match, Coach, Live-Ansicht und Aufstiegs-Prognose – alles an einem Ort.$\r$\n$\r$\nDie Installation dauert nur einen Moment."
  !define MUI_FINISHPAGE_TITLE "Alles bereit"
  !define MUI_FINISHPAGE_TEXT "Der Deadlock Tracker ist installiert.$\r$\n$\r$\nBeim ersten Start trägst du deine Steam-ID ein – danach erscheinen deine Matches automatisch.$\r$\n$\r$\nViel Erfolg in der nächsten Runde!"
  !define MUI_FINISHPAGE_RUN_TEXT "Deadlock Tracker jetzt starten"
  !define MUI_DIRECTORYPAGE_TEXT_TOP "Wähle den Ordner, in dem der Deadlock Tracker installiert werden soll."

  ; Farbiger Fortschrittsbalken (Gold auf Dunkel) und Statuszeilen
  !define MUI_INSTFILES_PAGE_PROGRESSBAR "colored"
  InstallColors F0B44C 0B0E15

  BrandingText "Deadlock Tracker  ·  ${VERSION}"
!macroend

!macro customInstall
  DetailPrint "Deadlock Tracker ${VERSION} ist installiert."
  DetailPrint "Verknüpfungen angelegt – bereit zum Start."
!macroend

!macro customUnInstall
  DetailPrint "Deadlock Tracker wurde entfernt. Deine Matchdaten bleiben im Benutzerordner erhalten."
!macroend
