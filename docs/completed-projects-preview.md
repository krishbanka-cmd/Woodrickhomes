# Completed projects — preview QA, 27 October 2026

Live deployment: NOT performed. Owner requires preview and explicit confirmation before deployment.

Baseline checkout commit: 4449628. This is the checkout baseline, not an independently verified deployed Cloudflare version.
Feature implementation commit: 9c06ea0; subsequent preview fix corrects HTML form reset shadowed by the reset button ID.

## Evidence
- Browser, isolated Node preview with actual project handler and simulated R2: draft create/save, architect and firm credit, JPG and MP4 upload, preview rendering, video playback (readyState 4, duration 1 second, ended true), edit and published gallery rendering passed.
- Authenticated CRUD, draft filtering, unauthenticated rejection, unsafe upload rejection, cross-origin rejection and delete: automated test passed.
- Existing media boundary and public index checks: seven passed.
- Preview is desktop only; actual phone, real R2, Worker runtime, signed-in production admin and complete catalogue browsing still require staging verification. The preview is not a production backend validation.
- Live site and production data were not changed.

## Rollback
Before deployment, identify the currently deployed Cloudflare version and its commit; retain that version as rollback target. Preserve existing R2 data; this feature adds only private/completed-projects/ records and media. A code rollback must NOT delete those objects.
Prefer restoring the retained Cloudflare deployment if no later changes exist. Otherwise revert only the feature commits and deploy that change, retaining unrelated commits. Recheck home, services, catalogue viewing and admin login. Do not claim a production restore has been tested before deployment access exists.
