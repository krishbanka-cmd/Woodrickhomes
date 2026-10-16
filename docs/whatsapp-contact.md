# Website WhatsApp enquiry number

The website's enquiry destination is **+91 8090781345**. Public homepage,
product/category, catalogue and design enquiry links go through `/whatsapp`.
The route preserves the enquiry text and redirects to WhatsApp without caching.
Call links retain their existing phone numbers. Vendor/customer follow-up links
that target an individual person's phone number are not changed.

To change the enquiry number later, open Cloudflare → Workers & Pages →
woodrickhomes → Settings → Variables and Secrets. Add/update the text variable
`WHATSAPP_NUMBER` with the Indian 10-digit number or `91` plus the number, then
save the settings. This is a public contact number, not an API credential.
No page-by-page code edit is required. `keep_vars = true` preserves the variable
on subsequent Wrangler deployments. When unset/invalid, the fallback is
8090781345 in `worker-whatsapp-contact.js`.

This changes where customers start a WhatsApp conversation. Automated message
replies, order extraction and vendor alerts use their separate API integrations.
