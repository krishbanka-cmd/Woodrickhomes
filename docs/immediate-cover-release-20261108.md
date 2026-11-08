# Immediate opening cover from supplied video

Video evidence: laptop catalogue click shows blank viewer with Preparing catalogue for roughly 1–2 seconds before first page appears. This is the reported symptom, not primarily mobile-only or a cover-aspect jump.

Previous source: 8b32807dadff3e38febdd5a587344052f2345426. Prior Worker: c3214708-2624-49f1-9fc8-45409c30e1fe.

Change: a small synchronous safe bootstrap in presentation HTML paints the existing static listing cover and title before viewer module/manifest loading. Shared viewer adopts already-loaded image, retains it until first-page canvas finishes, and uses the validated cover for other supported entry points. No extra full-size first-page request or speculative PDF worker downloads on prepared documents. New cache revision.

129 automated tests passed, including bootstrap rendering before any viewer module exists and rejecting external/private image paths. Desktop isolated preview visibly displayed Godrej cover while Next was still disabled, then 144-page document loaded and Next/Previous succeeded. This removes the blank wait where a cached cover is available; it does not promise immediate full-document interaction. Image aspect can differ when the actual page replaces a listing cover. Mobile confirmation remains pending.

Rollback only this release's viewer.js, index.html and matching tests; keep prior performance changes and data. Immediate previous version recorded above may be restored if no intervening deployment exists. No database or upload changes.
