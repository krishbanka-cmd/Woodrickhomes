# PDF viewer startup release

Base GitHub commit: a07270f2832d6408c55c6d001ce3a2d30cfc0da8.
Prior Cloudflare deployment: c2457902-5762-4973-8268-e4e0f44d6c8b.
Prior live Worker version: 8e81364f-9cb8-4b30-83f1-0c45966573f3 (100%).

Change: overlap shared PDF engine initialization with prepared-page manifest lookup. Settle engine errors without preventing successful prepared-image loading. Bump viewer URL revision to invalidate browser caching.

Validation: 127 local Node tests pass. Desktop browser isolated read-only proxy preview renders MWUD (78 pages) and Woodline (51 pages). Next/Previous, Zoom/Fit, and return to catalogue list checked. Preview forwards only public GET/HEAD, carries no production credentials or storage bindings. Real mobile testing and controlled before/after timing remain unverified; no numerical speed improvement claimed. Engine startup may now download worker assets even when prepared images are available.

Deployment authorized by owner in chat, conditional on regression checks. No database/schema/storage mutations.

Rollback: restore prior Worker version above if a release regression is observed and no intervening deployment exists. Otherwise revert only this release's viewer.js, index.html and matching test changes on top of current main and redeploy. Do not reset unrelated commits or data.
