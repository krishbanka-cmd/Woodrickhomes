# First-page loading regression follow-up

Owner still reported first-page opening regression after stable-cover release. Prior source: 383e49f3486198fe187f4250f3b050b9dac32e9c. Prior Worker: b3f009c1-80c3-40e1-ae0e-88c79abcdb1a.

Inspection found standalone preview image requested without revision, followed by prepared adapter requesting same page with revision. In addition, speculative PDF engine initialization fetched worker code even for prepared-image documents. Manifest lookup was abandoned after 2.5 seconds; one external HTTP sample took 8.49 seconds (not a phone benchmark).

Change: prepared documents paint their first page once, without separate preview or speculative PDF engine loading. Use validated listing-cover fallback only when prepared pages are unavailable. Extend manifest request deadline to 12 seconds rather than prematurely switching a slow prepared document to heavy PDF fallback. Bump both viewer and prepared adapter cache URLs. No server, database or original-media modifications.

128 automated tests pass. New behavioral tests assert no PDF engine startup or duplicate preview during a prepared opening, plus working PDF fallback when manifest is absent. Isolated desktop preview confirmed Godrej uses prepared-images, first-page preview src is absent, 144 pages available, Next/Previous and Zoom/Fit work. No real mobile trace or numerical speed improvement verified.

Rollback only these files/test updates on current main. Prior version recorded above can be restored only if no intervening unrelated deployment exists. Owner's report remains unresolved until mobile confirmation; desktop checks are not proof of no mobile regression.
