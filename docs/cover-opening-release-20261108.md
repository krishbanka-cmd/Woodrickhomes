# Stable first-page cover

Previous source: 47a4547e530c5681a6476dd1796804f84d167ca6.
Previous deployed Worker: e44baf3e-5106-40f8-80b3-ad346f646402.

Observed Godrej listing cover aspect: 379/520, including print margins; final page aspect approximately 1697/2400, without those margins. Switching from listing cover to first page visibly changes framing.

Use the existing permission-checked prepared first-page endpoint as the opening image; retain the validated listing cover as a one-time fallback for unprepared files. Keep the image visible until the canvas is rendered. Bump viewer URL cache revision.

128 local tests passed, including delayed first-page rendering and stable frame dimensions. Isolated desktop proxy preview verified Godrej first page and Next/Previous. Real mobile display remains unverified. This addresses cover-to-page mismatch, not all network latency. Prepared images add image bytes; already used by the prepared renderer and browser caching remains available.

Rollback: revert only this release's viewer, index and corresponding tests on top of current main; redeploy. If immediate regression and no intervening release, restore prior Worker version above. No data/schema changes.
