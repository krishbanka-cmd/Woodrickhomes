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
    const sheet = book.getSheetByName('Vendors') || book.insertSheet('Vendors');
    const headers = ['id','business','contact','mobile','city','category','gst','status','createdAt','updatedAt'];
    if (sheet.getLastRow() === 0) sheet.appendRow(headers);
    const rows = sheet.getDataRange().getValues();
    const index = rows.findIndex((row, i) => i > 0 && String(row[0]) === item.id);
    if (index > 0 && String(rows[index][9]) > String(item.updatedAt || '')) return json({ok:true});
    // Store user-entered text literally to avoid spreadsheet formula evaluation.
    const values = headers.map(key => {const value = String(item[key] || ''); return /^[=+@-]/.test(value) ? "'" + value : value;});
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
