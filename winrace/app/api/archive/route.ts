import { jsonOk, withApiErrors } from "@/lib/api";
import { requireUser } from "@/lib/server/route-helpers";
import { listArchivedRooms } from "@/lib/server/archive";

export async function GET() {
  return withApiErrors(async () => {
    const user = await requireUser();
    const rooms = await listArchivedRooms(user.id);
    return jsonOk({ rooms });
  });
}
