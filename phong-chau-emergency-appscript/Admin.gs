/**
 * CÁC HÀM QUẢN TRỊ
 * Chạy trực tiếp trong trình biên tập Apps Script bằng tài khoản quản lý.
 */

function setupSystem() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (isSystemConfigured_()) {
      return getSystemInfo();
    }

    let parent = DriveApp.getRootFolder();
    if (APP_CONFIG.ROOT_PARENT_FOLDER_ID) {
      parent = DriveApp.getFolderById(APP_CONFIG.ROOT_PARENT_FOLDER_ID);
    }

    const rootFolder = parent.createFolder(APP_CONFIG.ROOT_FOLDER_NAME);
    const spreadsheet = SpreadsheetApp.create(APP_CONFIG.SPREADSHEET_NAME);
    DriveApp.getFileById(spreadsheet.getId()).moveTo(rootFolder);

    prepareSubmissionsSheet_(spreadsheet);
    prepareFilesSheet_(spreadsheet);
    prepareGuideSheet_(spreadsheet);

    const props = getScriptProperties_();
    props.setProperties({
      [PROPERTY_KEYS.ROOT_FOLDER_ID]: rootFolder.getId(),
      [PROPERTY_KEYS.SPREADSHEET_ID]: spreadsheet.getId(),
      [PROPERTY_KEYS.SYSTEM_ENABLED]: String(APP_CONFIG.ENABLED_AFTER_SETUP),
      [PROPERTY_KEYS.SETUP_AT]: new Date().toISOString(),
    });

    rootFolder.createFile(
      '00_HUONG_DAN_QUAN_TRI.txt',
      [
        APP_CONFIG.UNIT_NAME,
        APP_CONFIG.APP_NAME,
        '',
        '1. Không chia sẻ công khai thư mục này hoặc file Sheet.',
        '2. Chạy enableEmergencyMode() khi cần mở kênh dự phòng.',
        '3. Chạy disableEmergencyMode() khi App chính hoạt động lại.',
        '4. Chạy installCleanupTrigger() một lần để dọn hồ sơ tải dở quá 24 giờ.',
        '5. Cập nhật cột “Trạng thái đồng bộ” sau khi nhập hồ sơ vào App chính.',
      ].join('\n'),
      MimeType.PLAIN_TEXT
    );

    SpreadsheetApp.flush();
    return getSystemInfo();
  } finally {
    lock.releaseLock();
  }
}

function prepareSubmissionsSheet_(spreadsheet) {
  const defaultSheet = spreadsheet.getSheets()[0];
  defaultSheet.setName(APP_CONFIG.SUBMISSIONS_SHEET_NAME);
  defaultSheet.clear();
  defaultSheet.getRange(1, 1, 1, SUBMISSION_HEADERS.length).setValues([SUBMISSION_HEADERS]);
  defaultSheet.setFrozenRows(1);
  defaultSheet.getRange(1, 1, 1, SUBMISSION_HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#8f1621')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  defaultSheet.setColumnWidth(SUB_COL.ID, 145);
  defaultSheet.setColumnWidth(SUB_COL.STARTED_AT, 150);
  defaultSheet.setColumnWidth(SUB_COL.COMPLETED_AT, 150);
  defaultSheet.setColumnWidth(SUB_COL.STATUS, 145);
  defaultSheet.setColumnWidth(SUB_COL.FULL_NAME, 190);
  defaultSheet.setColumnWidth(SUB_COL.PHONE, 110);
  defaultSheet.setColumnWidth(SUB_COL.CITIZEN_ID, 130);
  defaultSheet.setColumnWidth(SUB_COL.ADDRESS, 280);
  defaultSheet.setColumnWidth(SUB_COL.NOTE, 260);
  defaultSheet.setColumnWidth(SUB_COL.FOLDER_LINK, 220);
  defaultSheet.setColumnWidth(SUB_COL.SYNC_STATUS, 145);
  defaultSheet.setColumnWidth(SUB_COL.INTERNAL_NOTE, 250);
  defaultSheet.hideColumns(SUB_COL.DEVICE_ID, SUBMISSION_HEADERS.length - SUB_COL.DEVICE_ID + 1);
  defaultSheet.getRange(2, SUB_COL.STARTED_AT, defaultSheet.getMaxRows() - 1, 2)
    .setNumberFormat('dd/MM/yyyy HH:mm:ss');
  defaultSheet.getRange(2, SUB_COL.PHONE, defaultSheet.getMaxRows() - 1, 2)
    .setNumberFormat('@');

  const syncValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList([
      SYNC_STATUS.PENDING,
      SYNC_STATUS.PROCESSING,
      SYNC_STATUS.DONE,
      SYNC_STATUS.DUPLICATE,
      SYNC_STATUS.NEED_CONTACT,
    ], true)
    .setAllowInvalid(false)
    .build();
  defaultSheet
    .getRange(2, SUB_COL.SYNC_STATUS, defaultSheet.getMaxRows() - 1, 1)
    .setDataValidation(syncValidation);
  defaultSheet.getDataRange().createFilter();
}

function prepareFilesSheet_(spreadsheet) {
  const sheet = spreadsheet.insertSheet(APP_CONFIG.FILES_SHEET_NAME);
  sheet.getRange(1, 1, 1, FILE_HEADERS.length).setValues([FILE_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, FILE_HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#5f1119')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  sheet.setColumnWidth(1, 145);
  sheet.setColumnWidth(5, 260);
  sheet.setColumnWidth(8, 410);
  sheet.setColumnWidth(9, 250);
  sheet.setColumnWidth(10, 150);
  sheet.getRange(2, 10, sheet.getMaxRows() - 1, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
  sheet.getDataRange().createFilter();
}

function prepareGuideSheet_(spreadsheet) {
  const sheet = spreadsheet.insertSheet(APP_CONFIG.GUIDE_SHEET_NAME);
  const rows = [
    ['HỆ THỐNG', APP_CONFIG.APP_NAME],
    ['ĐƠN VỊ', APP_CONFIG.UNIT_NAME],
    ['PHẠM VI', APP_CONFIG.COVERAGE_NOTICE],
    ['HỖ TRỢ', APP_CONFIG.SUPPORT_OFFICER + ' - ' + APP_CONFIG.SUPPORT_PHONE],
    ['', ''],
    ['QUY TRÌNH', 'Người dân gửi hồ sơ → cán bộ kiểm tra thư mục → nhập vào App chính → cập nhật trạng thái đồng bộ.'],
    ['BẬT HỆ THỐNG', 'Chạy hàm enableEmergencyMode() trong Apps Script.'],
    ['TẮT HỆ THỐNG', 'Chạy hàm disableEmergencyMode() trong Apps Script.'],
    ['DỌN TẢI DỞ', 'Chạy installCleanupTrigger() một lần để hệ thống kiểm tra hằng ngày.'],
    ['LƯU Ý', 'Không cấp quyền “Anyone with the link” cho thư mục Drive hoặc bảng tính.'],
  ];
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 650);
  sheet.getRange(1, 1, rows.length, 1).setFontWeight('bold');
  sheet.getRange(1, 1, 4, 2).setBackground('#f7ead0');
  sheet.getDataRange().setWrap(true).setVerticalAlignment('top');
}

function enableEmergencyMode() {
  assertSystemConfigured_();
  getScriptProperties_().setProperty(PROPERTY_KEYS.SYSTEM_ENABLED, 'true');
  return getSystemInfo();
}

function disableEmergencyMode() {
  assertSystemConfigured_();
  getScriptProperties_().setProperty(PROPERTY_KEYS.SYSTEM_ENABLED, 'false');
  return getSystemInfo();
}

function getSystemInfo() {
  const configured = isSystemConfigured_();
  const props = getScriptProperties_();
  return {
    configured: configured,
    enabled: configured && isEmergencyEnabled_(),
    rootFolderId: configured ? props.getProperty(PROPERTY_KEYS.ROOT_FOLDER_ID) : '',
    spreadsheetId: configured ? props.getProperty(PROPERTY_KEYS.SPREADSHEET_ID) : '',
    rootFolderUrl: configured
      ? 'https://drive.google.com/drive/folders/' + props.getProperty(PROPERTY_KEYS.ROOT_FOLDER_ID)
      : '',
    spreadsheetUrl: configured
      ? 'https://docs.google.com/spreadsheets/d/' + props.getProperty(PROPERTY_KEYS.SPREADSHEET_ID)
      : '',
    setupAt: props.getProperty(PROPERTY_KEYS.SETUP_AT) || '',
  };
}

function installCleanupTrigger() {
  removeCleanupTriggers_();
  ScriptApp.newTrigger('cleanupAbandonedSubmissions').timeBased().everyDays(1).atHour(2).create();
  return 'Đã cài lịch dọn hồ sơ tải dở hằng ngày.';
}

function removeCleanupTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'cleanupAbandonedSubmissions') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function cleanupAbandonedSubmissions() {
  assertSystemConfigured_();
  const sheet = getSubmissionsSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { expired: 0 };

  const now = Date.now();
  const cutoff = now - APP_CONFIG.ABANDONED_SUBMISSION_HOURS * 60 * 60 * 1000;
  const values = sheet.getRange(2, 1, lastRow - 1, SUBMISSION_HEADERS.length).getValues();
  let expired = 0;

  values.forEach(function (row, index) {
    const status = String(row[SUB_COL.STATUS - 1] || '');
    const lastActivity = Number(row[SUB_COL.LAST_ACTIVITY_EPOCH - 1] || 0);
    if (status !== STATUS.UPLOADING || !lastActivity || lastActivity >= cutoff) return;

    const folderId = String(row[SUB_COL.FOLDER_ID - 1] || '');
    if (folderId) {
      try {
        DriveApp.getFolderById(folderId).setTrashed(true);
      } catch (error) {
        console.error('Could not trash abandoned folder', folderId, error);
      }
    }

    const rowNumber = index + 2;
    const updates = {};
    updates[SUB_COL.STATUS] = STATUS.EXPIRED;
    updates[SUB_COL.TOKEN_HASH] = '';
    updates[SUB_COL.LAST_ACTIVITY_EPOCH] = now;
    updates[SUB_COL.LAST_ERROR] = 'Tự động dọn hồ sơ tải dở quá thời hạn.';
    updateSubmissionCells_(rowNumber, updates);
    expired += 1;
  });

  return { expired: expired };
}
