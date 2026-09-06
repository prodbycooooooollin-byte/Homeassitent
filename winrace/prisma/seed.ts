import { PrismaClient } from "@prisma/client";
import { hashSecret } from "../lib/codes";

const prisma = new PrismaClient();

const DEMO_ROOM_CODE = "WR-DEMO1";
const MINUTES = 60_000;

async function main() {
  console.log("Seeding: WinRace Demo-Arena …");

  // Vorherigen Demo-Stand vollständig entfernen (idempotent, betrifft nie echte Räume).
  await prisma.room.deleteMany({ where: { isDemo: true } });
  await prisma.user.deleteMany({ where: { email: { endsWith: "@demo.winrace.local" } } });

  const demoPassword = await hashSecret("demo-viewer-only");

  const hostUser = await prisma.user.create({
    data: { email: "host@demo.winrace.local", displayName: "Casterin Vex", passwordHash: demoPassword },
  });

  const nightRaiders = [
    { displayName: "Mira \"Ghost\" Owusu", twitch: "nightraider_mira" },
    { displayName: "Kenji Aoki", twitch: "nightraider_kenji" },
    { displayName: "Talia Novak", twitch: "nightraider_talia" },
    { displayName: "Bodhi Reyes", twitch: null as string | null },
  ];
  const zeroMercy = [
    { displayName: "Priya Kaur", twitch: "zeromercy_priya" },
    { displayName: "Lucas \"Fang\" Bianchi", twitch: "zeromercy_fang" },
    { displayName: "Sanne de Vries", twitch: "zeromercy_sanne" },
    { displayName: "Omar El-Sayed", twitch: null as string | null },
  ];

  const makeUsers = (list: typeof nightRaiders, prefix: string) =>
    Promise.all(
      list.map((m, i) =>
        prisma.user.create({
          data: {
            email: `${prefix}${i}@demo.winrace.local`,
            displayName: m.displayName,
            passwordHash: demoPassword,
          },
        })
      )
    );

  const [raidersUsers, mercyUsers] = await Promise.all([
    makeUsers(nightRaiders, "raider"),
    makeUsers(zeroMercy, "mercy"),
  ]);

  const now = new Date();
  const startedAt = new Date(now.getTime() - 42 * MINUTES);

  const room = await prisma.room.create({
    data: {
      code: DEMO_ROOM_CODE,
      name: "WinRace Demo-Arena",
      passwordHash: demoPassword,
      hostId: hostUser.id,
      isDemo: true,
      visibility: "PUBLIC",
      requireHostConfirmation: true,
      allowMemberProgress: true,
      maxMembersPerTeam: 4,
      startAt: startedAt,
      teams: {
        create: [
          { side: "A", name: "Night Raiders", color: "#6366f1" },
          { side: "B", name: "Zero Mercy", color: "#ef4444" },
        ],
      },
      challenge: {
        create: { status: "RUNNING", startedAt },
      },
      members: {
        create: { userId: hostUser.id, role: "HOST", status: "ACTIVE" },
      },
    },
    include: { teams: true, challenge: true },
  });

  const teamA = room.teams.find((t) => t.side === "A")!;
  const teamB = room.teams.find((t) => t.side === "B")!;

  await Promise.all(
    raidersUsers.map((u, i) =>
      prisma.roomMember.create({
        data: {
          roomId: room.id,
          userId: u.id,
          teamId: teamA.id,
          role: i === 0 ? "TEAM_LEAD" : "MEMBER",
          isTeamLead: i === 0,
          status: "ACTIVE",
          twitchLoginOverride: nightRaiders[i].twitch,
        },
      })
    )
  );
  await Promise.all(
    mercyUsers.map((u, i) =>
      prisma.roomMember.create({
        data: {
          roomId: room.id,
          userId: u.id,
          teamId: teamB.id,
          role: i === 0 ? "TEAM_LEAD" : "MEMBER",
          isTeamLead: i === 0,
          status: "ACTIVE",
          twitchLoginOverride: zeroMercy[i].twitch,
        },
      })
    )
  );

  const games = await Promise.all([
    prisma.challengeGame.create({
      data: {
        challengeId: room.challenge!.id,
        order: 1,
        name: "Fortnite",
        progressType: "WINS",
        targetValue: 3,
        appliesTo: "BOTH",
        difficulty: 3,
        rulesText: "Solo-Wins zählen genauso wie Squad-Wins.",
      },
    }),
    prisma.challengeGame.create({
      data: { challengeId: room.challenge!.id, order: 2, name: "Rocket League", progressType: "WINS", targetValue: 5, appliesTo: "BOTH", difficulty: 2 },
    }),
    prisma.challengeGame.create({
      data: { challengeId: room.challenge!.id, order: 3, name: "Fall Guys", progressType: "WINS", targetValue: 2, appliesTo: "BOTH", difficulty: 1 },
    }),
    prisma.challengeGame.create({
      data: { challengeId: room.challenge!.id, order: 4, name: "Valorant", progressType: "WINS", targetValue: 4, appliesTo: "BOTH", difficulty: 4, bonusPoints: 50 },
    }),
  ]);
  const [fortnite, rocketLeague, fallGuys, valorant] = games;

  async function seedProgress(
    gameId: string,
    teamId: string,
    actorId: string,
    steps: number,
    target: number,
    minutesAgoStart: number
  ) {
    const progress = await prisma.teamGameProgress.upsert({
      where: { gameId_teamId: { gameId, teamId } },
      update: {},
      create: { gameId, teamId },
    });

    let value = 0;
    for (let i = 0; i < steps; i++) {
      const at = new Date(now.getTime() - (minutesAgoStart - i * 6) * MINUTES);
      value += 1;
      await prisma.teamGameProgressLog.create({
        data: {
          progressId: progress.id,
          actorId,
          delta: 1,
          previousValue: value - 1,
          newValue: value,
          createdAt: at,
        },
      });
    }
    const completed = value >= target;
    await prisma.teamGameProgress.update({
      where: { gameId_teamId: { gameId, teamId } },
      data: {
        value,
        status: completed ? "COMPLETED" : value > 0 ? "ACTIVE" : "PENDING",
        startedAt: new Date(now.getTime() - minutesAgoStart * MINUTES),
        completedAt: completed ? new Date(now.getTime() - (minutesAgoStart - (steps - 1) * 6) * MINUTES) : null,
        lastUpdatedById: actorId,
        lastUpdatedAt: new Date(now.getTime() - (minutesAgoStart - (steps - 1) * 6) * MINUTES),
      },
    });
  }

  await seedProgress(fortnite.id, teamA.id, raidersUsers[0].id, 2, 3, 40);
  await seedProgress(fortnite.id, teamB.id, mercyUsers[1].id, 1, 3, 35);
  await seedProgress(rocketLeague.id, teamA.id, raidersUsers[1].id, 1, 5, 20);
  await seedProgress(fallGuys.id, teamB.id, mercyUsers[0].id, 2, 2, 30);
  // Restliche Fortschritts-Zeilen (0/x) für alle übrigen Spiel/Team-Kombinationen anlegen.
  for (const g of games) {
    for (const t of [teamA, teamB]) {
      await prisma.teamGameProgress.upsert({
        where: { gameId_teamId: { gameId: g.id, teamId: t.id } },
        update: {},
        create: { gameId: g.id, teamId: t.id },
      });
    }
  }

  await prisma.activityEvent.createMany({
    data: [
      { roomId: room.id, actorId: hostUser.id, type: "CHALLENGE_STARTED", message: "Die Challenge wurde gestartet. Viel Erfolg! 🚀", createdAt: startedAt },
      { roomId: room.id, actorId: mercyUsers[0].id, type: "GAME_COMPLETED", message: "Zero Mercy hat „Fall Guys“ abgeschlossen! 🎉", createdAt: new Date(now.getTime() - 18 * MINUTES) },
      { roomId: room.id, actorId: raidersUsers[0].id, type: "PROGRESS_UPDATE", message: "Mira \"Ghost\" Owusu hat für Night Raiders 1 Sieg(e) bei „Fortnite“ eingetragen (2/3).", createdAt: new Date(now.getTime() - 10 * MINUTES) },
      { roomId: room.id, actorId: hostUser.id, type: "CHALLENGE_PAUSED", message: "Der Host hat die Challenge pausiert.", createdAt: new Date(now.getTime() - 8 * MINUTES) },
      { roomId: room.id, actorId: hostUser.id, type: "CHALLENGE_RESUMED", message: "Der Host hat die Challenge fortgesetzt.", createdAt: new Date(now.getTime() - 7 * MINUTES) },
    ],
  });

  console.log(`✔ Demo-Raum bereit: ${DEMO_ROOM_CODE} (öffentlich unter /rooms/${DEMO_ROOM_CODE}/live bzw. /demo)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
