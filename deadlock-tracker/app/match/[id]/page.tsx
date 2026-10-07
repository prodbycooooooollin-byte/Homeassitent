import { MatchView } from "@/components/MatchView";

export default function MatchPage({ params, searchParams }: { params: { id: string }; searchParams: { account?: string } }) {
  return <MatchView matchId={Number(params.id)} account={Number(searchParams.account) || 0} />;
}
