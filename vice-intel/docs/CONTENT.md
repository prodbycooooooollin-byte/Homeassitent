# Content guide

The knowledge base is the product. The AI, search and map only ever show what is in it.

## Workflow

1. Add or edit a record in `content/` (`official.ts`, `demo.ts`, or a new file you add to `lib/content/repository.ts`).
2. Reference sources by id from `content/sources.ts` (add new sources there).
3. Run `npm run content:check`. It fails on schema errors, broken references and unknown sources.
4. Open a pull request. CI validates again. When it merges, search, map, AI retrieval and related links update
   automatically.

`/admin` (the content desk) shows the integrity report, status counts, every record and a copyable template.

## Status rules

| Status | Use when | Requires |
| --- | --- | --- |
| `verified` | An editor reproduced it in the released game | ≥1 source, `checkedAt` date |
| `official` | Stated in Rockstar's own material | Official source |
| `estimate` | Measured or calculated value | Method in `note` |
| `theory` | Plausible community theory | Put it in `claims`, never in steps |
| `unverified` | Reported but not reproduced | Put it in `claims` |
| `demo` | Sample data for development | Nothing. Never ship demo records as real |
| `unknown` | Placeholder for a known gap | – |

Values inside a record (payouts, durations, rewards, prices) carry their own status. A verified mission can have an
estimated payout.

## Media

- Use `src` only for images you have the right to use, and fill in `attribution` (label, license, URL).
- Set `authenticGameplay: true` only for genuine in-game captures.
- Without a licensed image, use `art: { scene, seed }` for an original illustration. The UI marks these as
  "Illustration".
- Use `focal` to keep crops consistent across card, hero and thumbnail aspect ratios.
- `alt` text is required.

## Map

`mapPoint` uses the schematic 1000×1000 coordinate space (`lib/map/leonida.ts`). Set `precision` honestly: `exact`
only when the position is verified, `approximate` for a nearby pin, `region` for a whole area.
