# Vendor panel operations

Pages: `/become-a-vendor/` (registration), `/vendor/` (vendor dashboard), `/admin-products/vendors/` (existing admin login required).

1. Review a vendor's private business document and mobile number in the admin panel.
2. Approve the vendor. When OTP is unavailable, confirm manual mobile verification only after your team has actually verified the number.
3. Create a one-time access link and share it directly with that vendor. It expires after 24 hours and can be used once. Dashboard sessions expire after 8 hours; create a new link when needed.
4. Vendor uploads photos, PDF catalogues or videos. Review them under Products. Only approved media appears in public product and brand pages.
5. Editing an approved product preserves its previously approved media while the revision is pending. Rejection or archival removes public media. Suspending a vendor removes all of their approved media; reinstatement requires product review again.

Records, business documents, draft product files, audit events and backup queues are stored in the existing R2 bucket under `private/vendors/`. Approved copies are under `vendor-public/`. Public APIs reject private file access. Lists use pagination without a fixed 100-vendor limit.

## Optional OTP activation

Set Cloudflare Worker secrets `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`. Use `VENDOR_OTP_CHANNEL=whatsapp` only for a configured Twilio Verify WhatsApp channel; SMS is the default. The server uses actual provider verification, with resend and attempt limits. No demo OTP exists. Without provider credentials, private applications and admin-issued vendor access links remain available.

An optional `VENDOR_SESSION_SECRET` must be a strong stable random secret. Otherwise the existing `ADMIN_UPLOAD_TOKEN` signs vendor sessions and mobile indexes. Changing the signing secret invalidates sessions; existing records are discovered and reindexed on mobile sign-in.

## Optional Google Sheet backup

R2 remains the primary store; Sheet delivery failures never delete vendor records. Pending events are stored under `private/vendors/backup/`. The admin panel offers a retry action.

Use `google-apps-script/vendor-backup.gs` with a dedicated Sheet. Set Apps Script properties `SPREADSHEET_ID` and a strong random `VENDOR_SHEET_TOKEN`. Deploy as a web app that executes as the owner and accepts webhook requests. Set the deployment URL and matching token as Worker secrets `VENDOR_SHEET_URL`, `VENDOR_SHEET_TOKEN`. Keep the Sheet private. The webhook upserts by vendor ID and ignores stale events. KYC files and access tokens are never sent to Sheets.

## Verification

Run `node --experimental-default-type=module --test tests/vendors.test.mjs` with Node 22. Synthetic tests cover owner isolation, private KYC, mobile-verification gates, single-use links, OTP provider integration, moderation, duplicate preservation across vendors, suspension, paginated search beyond 1,000 vendors and cross-origin write protection. Deployment runs these tests before publishing.

PDF catalogues support up to 500 MB per file. Files over 20 MB use authenticated 8 MB multipart uploads to private storage, with progress and automatic part retries. Completed uploads remain private until product approval. Upload sessions expire after 24 hours; unfinished R2 multipart uploads are removed by R2 after its default seven-day lifecycle.

Alternatively, signed-in admins can save the Apps Script URL and token under Google Sheet backup settings. These are stored only in private R2 settings and never returned by APIs. Server environment secrets take precedence. Retry Sheet backup confirms actual delivery instead of merely queuing it.

## Homepage login and passwords
Homepage Vendor Login opens a login popup. New vendors use Register your business. Approved, mobile-verified vendors use an OTP or a one-time admin link once to set a password in their dashboard. They can then sign in from any device using mobile + password without further access links. Password recovery requires fresh OTP verification or a new admin-issued link. Passwords are salted PBKDF2 hashes stored in private credential records, never included in public responses or Sheet backups.

Vendor registration accepts Gmail and domain email addresses. Existing vendors add an email under Email for login in their dashboard. Admins must verify ownership with the vendor before selecting Enable email login. Verified email + existing password and mobile + password both sign into the same account. Email changes disable email login until reverified; email OTP delivery is not configured. Updated Sheet script appends email columns and requires redeployment to mirror them.


## Two-step Become a Vendor registration (October 2026)

The public `/become-a-vendor/` page initially shows only **name, mobile number and explicit registration-follow-up consent**. When the first step succeeds it stores a private, rate-limited, mobile-deduplicated lead in R2 under `private/vendors/leads/`, queues an event under `private/vendors/backup/leads/`, and opens the full business application in a same-page dialog. Existing OTP verification, document upload, manual review, approval and account login remain unchanged. The full form includes an optional WhatsApp number separate from the login mobile.

To enable **automatic Google Sheet lead delivery**, redeploy the updated `google-apps-script/vendor-backup.gs` to the **existing Google Apps Script web-app deployment** as a new version. Use the same Apps Script properties `SPREADSHEET_ID` and `VENDOR_SHEET_TOKEN`; confirm Cloudflare's `VENDOR_SHEET_URL` / `VENDOR_SHEET_TOKEN` (or admin Sheet backup settings) are configured. The new script creates a separate **Vendor Leads** tab with contact, mobile, status (`incomplete` or `submitted`), timestamps, full application reference, editable `followUpStatus` and `remark` columns. Sheet updates preserve staff-entered follow-up statuses and remarks. **Existing Vendors tab remains the complete vendor application mirror**.

The Worker checks that the Apps Script webhook advertises version 2 before sending quick leads. This avoids putting incomplete leads into the existing Vendors tab when an older script is still deployed. Until the Apps Script is updated or Sheet delivery succeeds, the lead is saved in **private R2**, its Sheet backup record remains **pending**, and the visitor is told only that their details were saved. A successful Cloudflare deployment alone does **not** confirm successful Google Sheet delivery; conduct a consenting test lead and inspect the Vendor Leads tab and private backup status before announcing end-to-end Sheet sync. The v2 capability check is read-only and exposes no lead data.

Quick leads are not verified vendor accounts and never grant product upload, approval, passwords or protected document access. Staff can follow up only about the requested registration assistance; respect a "not interested" response and cease follow-up.
