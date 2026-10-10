// Private Google Sheet mirror; R2 is the primary vendor store.
function doPost(request) {
  const json = value => ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
  const lock = LockService.getScriptLock();
  try {
    const config = PropertiesService.getScriptProperties();
    const payload = JSON.parse(request.postData.contents);
    const token = config.getProperty('VENDOR_SHEET_TOKEN');
    if (!token || payload.token !== token) return json({ok:false});
    const item = payload.event;
    if (!item || !/^[a-f0-9-]{36}$/.test(item.id || '')) return json({ok:false});
    lock.waitLock(10000);
    const book = SpreadsheetApp.openById(config.getProperty('SPREADSHEET_ID'));
    const isLead = payload.kind === 'lead';
    const tab = isLead ? 'Vendor Leads' : 'Vendors';
    const sheet = book.getSheetByName(tab) || book.insertSheet(tab);
    const headers = isLead
      ? ['id','contact','mobile','status','createdAt','updatedAt','fullApplicationId','followUpStatus','remark']
      : ['id','business','contact','mobile','city','category','gst','status','createdAt','updatedAt','brands','supplyLocations','email','emailVerified'];
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

