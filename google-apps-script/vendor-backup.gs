// Private Google Sheet mirror; R2 is the primary vendor store.
// A safe capability check prevents older deployments from putting leads in Vendors.
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({
    version:3,
    supportsVendorLeads:true,
    supportsVendorNotificationEmail:true
  })).setMimeType(ContentService.MimeType.JSON);
}
function doPost(request) {
  const json = value => ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
  const lock = LockService.getScriptLock();
  try {
    const config = PropertiesService.getScriptProperties();
    const payload = JSON.parse(request.postData.contents);
    const token = config.getProperty('VENDOR_SHEET_TOKEN');
    if (!token || payload.token !== token) return json({ok:false});
    if (payload.kind === 'notification-email') {
      // Only the Cloudflare Worker knows the private token. Log sent IDs to
      // avoid re-sending after a normal webhook retry.
      const n = payload.notification;
      if (!n || !/^(registration|product)-[a-f0-9-]{36}-[0-9]+:email:/.test(String(n.id || '')) ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(n.to || '')) ||
          String(n.subject || '').length > 200 || String(n.body || '').length > 3000) return json({ok:false});
      lock.waitLock(10000);
      const book = SpreadsheetApp.openById(config.getProperty('SPREADSHEET_ID'));
      const sheet = book.getSheetByName('Vendor Notification Log') || book.insertSheet('Vendor Notification Log');
      if (!sheet.getLastRow()) sheet.appendRow(['id', 'recipient', 'subject', 'sentAt']);
      const ids = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues() : [];
      if (ids.some(row => String(row[0]) === n.id)) return json({ok:true,alreadySent:true});
      MailApp.sendEmail({to:String(n.to),subject:String(n.subject),body:String(n.body),
        name:'Woodrick Homes Vendor Alerts'});
      // Prefix user-controlled text to prevent Sheets formula evaluation.
      const plain = value => /^[=+@-]/.test(value) ? "'" + value : value;
      sheet.appendRow([plain(String(n.id)),plain(String(n.to)),
        plain(String(n.subject)),new Date().toISOString()]);
      return json({ok:true});
    }
    const item = payload.event;
    if (!item || !/^[a-f0-9-]{36}$/.test(item.id || '')) return json({ok:false});
    lock.waitLock(10000);
    const book = SpreadsheetApp.openById(config.getProperty('SPREADSHEET_ID'));
    const isLead = payload.kind === 'lead';
    const tab = isLead ? 'Vendor Leads' : 'Vendors';
    const sheet = book.getSheetByName(tab) || book.insertSheet(tab);
    const headers = isLead
      ? ['id','contact','mobile','status','createdAt','updatedAt','fullApplicationId','followUpStatus','remark']
      : ['id','business','contact','mobile','city','category','gst','status','createdAt','updatedAt','brands','supplyLocations','email','emailVerified','whatsapp'];
    if (sheet.getLastRow() === 0) sheet.appendRow(headers);
    else sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    const rows = sheet.getDataRange().getValues();
    const index = rows.findIndex((row, i) => i > 0 && String(row[0]) === item.id);
    const dateColumn = headers.indexOf('updatedAt');
    if (index > 0 && String(rows[index][dateColumn]) > String(item.updatedAt || '')) return json({ok:true});
    // Store user-entered text literally to avoid spreadsheet formula evaluation.
    // Follow-up status and remarks are maintained by staff inside the Leads tab.
    // Webhook retries must not clear or overwrite those human-entered fields.
    const existing = index > 0 ? rows[index] : [];
    const values = headers.map((key, i) => {
      const value = String(isLead && ['followUpStatus','remark'].includes(key) ? (existing[i] || '') : (item[key] ?? ''));
      return /^[=+@-]/.test(value) ? "'" + value : value;
    });
    const range = sheet.getRange(index > 0 ? index + 1 : sheet.getLastRow() + 1, 1, 1, headers.length);
    range.setNumberFormat('@');
    range.setValues([values]);
    return json({ok:true});
  } catch (error) {
    return json({ok:false});
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

