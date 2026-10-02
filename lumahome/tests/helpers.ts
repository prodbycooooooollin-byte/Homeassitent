import { DEFAULT_SETTINGS, type EnergyMeter, type Project } from "@/model/types";
import { makeRoom, rectVertices } from "@/geometry/ops";

export function emptyProject(): Project {
  return {
    id: "proj_test",
    name: "Test",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    floors: [{ id: "floor_eg", name: "Erdgeschoss", elevation: 0, height: 2.6 }],
    rooms: [],
    openings: [],
    voids: [],
    items: [],
    bindings: [],
    meters: [],
    underlays: [],
    assets: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** Zwei nebeneinanderliegende Räume (4×4 und 3×4), gemeinsame Wand bei x=4. */
export function twoRooms(): Project {
  const p = emptyProject();
  const a = { ...makeRoom("floor_eg", "Wohnzimmer", rectVertices(0, 0, 4, 4)), id: "room_a" };
  const b = { ...makeRoom("floor_eg", "Küche", rectVertices(4, 0, 3, 4)), id: "room_b" };
  return { ...p, rooms: [a, b] };
}

export function meter(p: Partial<EnergyMeter> & { id: string }): EnergyMeter {
  return {
    label: p.id,
    flow: "consumption",
    powerEntityId: null,
    energyEntityId: null,
    invertPower: false,
    isHouseMain: false,
    roomId: null,
    itemId: null,
    parentId: null,
    coversWholeRoom: false,
    socEntityId: null,
    ...p,
  };
}
