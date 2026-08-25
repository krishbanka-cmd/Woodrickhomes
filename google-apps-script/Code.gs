const SHEET_NAME = 'Website Enquiries';
const NOTIFICATION_EMAIL = 'woodrickhomes@gmail.com';
const SEND_EMAIL_NOTIFICATION = true;

function doPost(e) {
  try {
    const data = parseRequest_(e);
    const sheet = getSheet_();

    ensureHeaders_(sheet);

    sheet.appendRow([
      new Date(),
      data.name || '',
      data.mobile || '',
      data.email || '',
      data.city || '',
      data.requirement || '',
      data.message || '',
      data.source || 'woodrickhomes.com'
    ]);

    if (SEND_EMAIL_NOTIFICATION && NOTIFICATION_EMAIL) {
      sendEmailNotification_(data);
    }

    return json_({ ok: true, message: 'Enquiry saved' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doGet() {
  return json_({ ok: true, service: 'Woodrick Homes enquiry endpoint' });
}

function parseRequest_(e) {
  if (!e) return {};

  if (e.postData && e.postData.contents) {
    const type = (e.postData.type || '').toLowerCase();
    if (type.indexOf('application/json') !== -1) {
      return JSON.parse(e.postData.contents || '{}');
    }
  }

  return e.parameter || {};
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() > 0) return;
  sheet.appendRow([
    'Timestamp',
    'Name',
    'Mobile',
    'Email',
    'City',
    'Requirement',
    'Message',
    'Source'
  ]);
  sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function sendEmailNotification_(data) {
  const subject = 'New Website Enquiry - Woodrick Homes';
  const body = [
    'A new enquiry has been received from woodrickhomes.com.',
    '',
    'Name: ' + (data.name || ''),
    'Mobile: ' + (data.mobile || ''),
    'Email: ' + (data.email || ''),
    'City: ' + (data.city || ''),
    'Requirement: ' + (data.requirement || ''),
    'Message: ' + (data.message || ''),
    '',
    'Source: ' + (data.source || 'woodrickhomes.com')
  ].join('\n');

  MailApp.sendEmail(NOTIFICATION_EMAIL, subject, body);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
