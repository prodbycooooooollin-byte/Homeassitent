// Feste, wiederverwendete Demo-Spieler für den Demo-Modus (siehe
// README/DemoModeBanner - überall deutlich als Beispieldaten gekennzeichnet).
// Zwei UUIDs gehören echten, öffentlich bekannten Minecraft-Testkonten
// (Notch, jeb_) - mc-heads.net zeigt dafür deren echte Skins, alle anderen
// sind frei erfunden (Steve-Platzhalter, falls der Avatar-Dienst sie nicht
// kennt).
export interface DemoPersona {
  uuid: string;
  username: string;
}

export const DEMO_PERSONAS: DemoPersona[] = [
  { uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5", username: "Notch" },
  { uuid: "853c80ef-3c37-49fd-aa49-938b674adae6", username: "jeb_" },
  { uuid: "11111111-2222-4333-8444-555555555001", username: "BauMeisterin_Lea" },
  { uuid: "11111111-2222-4333-8444-555555555002", username: "RedstonePero" },
  { uuid: "11111111-2222-4333-8444-555555555003", username: "EnderQueenXO" },
  { uuid: "11111111-2222-4333-8444-555555555004", username: "Bl0ckMeister" },
  { uuid: "11111111-2222-4333-8444-555555555005", username: "GrieferJulia" },
  { uuid: "11111111-2222-4333-8444-555555555006", username: "CraftboardFan99" },
];
