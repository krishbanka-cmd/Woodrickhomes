# Woodrick Homes enquiry → Google Sheets setup

The website enquiry backend is prepared to save these fields:

- Timestamp
- Name
- Mobile
- Email
- City
- Requirement
- Message
- Source

## Final Google-side activation

1. Create or open the Google Sheet that should store website enquiries.
2. Open Extensions → Apps Script.
3. Copy the contents of `google-apps-script/Code.gs` into the Apps Script project.
4. Deploy it as a Web App.
5. Execute as: Me.
6. Access: Anyone (or the broadest option available for public website form submissions).
7. Copy the generated Web App URL.
8. Add that URL to the website enquiry form submission code.

The backend currently supports an email notification to `woodrickhomes@gmail.com` and stores the customer email in the sheet. WhatsApp can remain enabled on the website independently, so the final behavior can be Google Sheet + WhatsApp, or Google Sheet + WhatsApp + email notification.
