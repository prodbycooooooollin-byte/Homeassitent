/**
 * Schematic map of Leonida for VICE INTEL (1000×1000 units).
 * This is an original, simplified illustration for orientation only —
 * NOT the in-game map, not to scale, and region placement is approximate.
 */
export const LAND_PATH =
  "M40 150 C160 128 380 118 620 128 C650 160 672 230 690 300 C712 390 742 470 778 560 C806 630 838 700 826 790 C816 838 790 860 744 866 C700 870 660 840 626 806 C584 764 548 700 516 630 C490 572 466 500 440 440 C420 392 396 350 360 322 C300 300 226 296 160 304 C110 310 70 300 40 286 Z";

export const LAKE = { cx: 600, cy: 520, rx: 46, ry: 34 };

export const KEYS: { cx: number; cy: number; rx: number; ry: number; rot: number }[] = [
  { cx: 712, cy: 892, rx: 26, ry: 8, rot: -12 },
  { cx: 672, cy: 906, rx: 30, ry: 8, rot: -8 },
  { cx: 626, cy: 916, rx: 28, ry: 7, rot: -4 },
  { cx: 580, cy: 922, rx: 26, ry: 7, rot: 0 },
  { cx: 536, cy: 924, rx: 22, ry: 6, rot: 4 },
  { cx: 496, cy: 920, rx: 18, ry: 6, rot: 8 },
];

/** Major road lines (purely decorative). */
export const ROADS = [
  "M120 230 C260 220 420 214 560 220 C620 260 650 330 676 410 C704 500 744 590 780 690",
  "M520 220 C510 300 500 380 520 460 C540 540 580 620 640 700 C680 740 720 760 760 780",
  "M760 780 C730 830 700 870 640 900 C590 918 540 922 490 918",
];

export const MAP_DISCLAIMER = "Schematic illustration — not the in-game map. Pin positions are approximate.";
