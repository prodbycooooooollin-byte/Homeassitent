import { OverlayContent } from "@/components/overlay/overlay-content";

export const dynamic = "force-dynamic";

export default function OverlayPage({
  params,
  searchParams,
}: {
  params: { code: string; type: string };
  searchParams: { token?: string };
}) {
  return <OverlayContent code={params.code} type={params.type} token={searchParams.token ?? null} />;
}
