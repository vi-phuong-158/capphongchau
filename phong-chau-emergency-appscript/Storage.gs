/** Các hàm thao tác Google Drive và Google Sheets. */

function getScriptProperties_() {
  return PropertiesService.getScriptProperties();
}

function isSystemConfigured_() {
  const props = getScriptProperties_();
  return Boolean(props.getProperty(PROPERTY_KEYS.ROOT_FOLDER_ID)) &&
    Boolean(props.getProperty(PROPERTY_KEYS.SPREADSHEET_ID));
}

function assertSystemConfigured_() {
  if (!isSystemConfigured_()) {
    throwPublicError_('Hệ thống dự phòng chưa được cài đặt.');
  }
}

function isEmergencyEnabled_() {
  return getScriptProperties_().getProperty(PROPERTY_KEYS.SYSTEM_ENABLED) === 'true';
}

function assertEmergencyEnabled_() {
  if (!isEmergencyEnabled_()) {
    throwPublicError_('Hệ thống kê khai dự phòng hiện chưa được kích hoạt.');
  }
}

function getRootFolder_() {
  assertSystemConfigured_();
  return DriveApp.getFolderById(getScriptProperties_().getProperty(PROPERTY_KEYS.ROOT_FOLDER_ID));
}

function getSpreadsheet_() {
  assertSystemConfigured_();
  return SpreadsheetApp.openById(
    getScriptProperties_().getProperty(PROPERTY_KEYS.SPREADSHEET_ID)
  );
}

function getSubmissionsSheet_() {
  const sheet = getSpreadsheet_().getSheetByName(APP_CONFIG.SUBMISSIONS_SHEET_NAME);
  if (!sheet) throw new Error('Không tìm thấy sheet hồ sơ.');
  return sheet;
}

function getFilesSheet_() {
  const sheet = getSpreadsheet_().getSheetByName(APP_CONFIG.FILES_SHEET_NAME);
  if (!sheet) throw new Error('Không tìm thấy sheet nhật ký tệp.');
  return sheet;
}

function getOrCreateChildFolder_(parent, name) {
  const iterator = parent.getFoldersByName(name);
  return iterator.hasNext() ? iterator.next() : parent.createFolder(name);
}

function createSubmissionFolder_(submissionId, fullName, now) {
  const root = getRootFolder_();
  const dateName = Utilities.formatDate(now, APP_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  const dateFolder = getOrCreateChildFolder_(root, dateName);
  return dateFolder.createFolder(submissionId + '_' + makeSafeFolderName_(fullName));
}

function appendSubmission_(record) {
  const sheet = getSubmissionsSheet_();
  sheet.appendRow([
    safeCell_(record.id),
    record.startedAt,
    '',
    STATUS.UPLOADING,
    safeCell_(record.fullName),
    safeCell_(record.phone),
    safeCell_(record.citizenId),
    safeCell_(record.address),
    record.certificateCount,
    safeCell_(record.note),
    0,
    0,
    record.folderUrl,
    SYNC_STATUS.PENDING,
    '',
    '',
    'Có',
    'Có',
    safeCell_(record.deviceId),
    record.tokenHash,
    record.folderId,
    record.startedEpoch,
    record.startedEpoch,
    safeCell_(record.clientVersion),
    safeCell_(record.userAgent),
    '',
  ]);
  return sheet.getLastRow();
}

function findSubmissionRow_(submissionId) {
  const sheet = getSubmissionsSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const finder = sheet
    .getRange(2, SUB_COL.ID, lastRow - 1, 1)
    .createTextFinder(String(submissionId))
    .matchEntireCell(true)
    .findNext();
  return finder ? finder.getRow() : 0;
}

function readSubmission_(submissionId) {
  const row = findSubmissionRow_(submissionId);
  if (!row) throwPublicError_('Không tìm thấy hồ sơ dự phòng.');
  const values = getSubmissionsSheet_()
    .getRange(row, 1, 1, SUBMISSION_HEADERS.length)
    .getValues()[0];
  return {
    row: row,
    id: String(values[SUB_COL.ID - 1] || ''),
    startedAt: values[SUB_COL.STARTED_AT - 1],
    completedAt: values[SUB_COL.COMPLETED_AT - 1],
    status: String(values[SUB_COL.STATUS - 1] || ''),
    fullName: String(values[SUB_COL.FULL_NAME - 1] || ''),
    phone: String(values[SUB_COL.PHONE - 1] || ''),
    citizenId: String(values[SUB_COL.CITIZEN_ID - 1] || ''),
    address: String(values[SUB_COL.ADDRESS - 1] || ''),
    certificateCount: Number(values[SUB_COL.CERT_COUNT - 1] || 0),
    note: String(values[SUB_COL.NOTE - 1] || ''),
    cccdImageCount: Number(values[SUB_COL.CCCD_IMAGE_COUNT - 1] || 0),
    gcnImageCount: Number(values[SUB_COL.GCN_IMAGE_COUNT - 1] || 0),
    folderUrl: String(values[SUB_COL.FOLDER_LINK - 1] || ''),
    deviceId: String(values[SUB_COL.DEVICE_ID - 1] || ''),
    tokenHash: String(values[SUB_COL.TOKEN_HASH - 1] || ''),
    folderId: String(values[SUB_COL.FOLDER_ID - 1] || ''),
    startedEpoch: Number(values[SUB_COL.STARTED_EPOCH - 1] || 0),
    lastActivityEpoch: Number(values[SUB_COL.LAST_ACTIVITY_EPOCH - 1] || 0),
  };
}

function updateSubmissionCells_(row, updates) {
  const sheet = getSubmissionsSheet_();
  Object.keys(updates).forEach(function (columnKey) {
    const column = Number(columnKey);
    sheet.getRange(row, column).setValue(updates[columnKey]);
  });
}

function nextSubmissionId_(now) {
  const dateKey = Utilities.formatDate(now, APP_CONFIG.TIME_ZONE, 'yyyyMMdd');
  const propertyKey = 'DAILY_COUNTER_' + dateKey;
  const props = getScriptProperties_();
  const current = Number(props.getProperty(propertyKey) || 0) + 1;
  props.setProperty(propertyKey, String(current));
  return 'DP-' + dateKey + '-' + ('0000' + current).slice(-4);
}

function buildSlotKey_(group, certificateIndex, imageIndex) {
  if (group === 'CCCD_FRONT' || group === 'CCCD_BACK') return group;
  return 'GCN-' + ('00' + certificateIndex).slice(-2) + '-' + ('00' + imageIndex).slice(-2);
}

function buildStoredFileName_(submissionId, group, certificateIndex, imageIndex, extension) {
  if (group === 'CCCD_FRONT') return submissionId + '_CCCD_MAT_TRUOC.' + extension;
  if (group === 'CCCD_BACK') return submissionId + '_CCCD_MAT_SAU.' + extension;
  return (
    submissionId +
    '_GCN_' +
    ('00' + certificateIndex).slice(-2) +
    '_ANH_' +
    ('00' + imageIndex).slice(-2) +
    '.' +
    extension
  );
}

function findFileLogBySlot_(submissionId, group, certificateIndex, imageIndex) {
  const sheet = getFilesSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const values = sheet.getRange(2, 1, lastRow - 1, FILE_HEADERS.length).getValues();
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const row = values[i];
    if (
      String(row[0]) === submissionId &&
      String(row[1]) === group &&
      Number(row[2] || 0) === certificateIndex &&
      Number(row[3] || 0) === imageIndex &&
      String(row[10]) === 'ĐÃ LƯU'
    ) {
      return {
        row: i + 2,
        fileName: String(row[4]),
        fileId: String(row[8]),
        slotKey: buildSlotKey_(group, certificateIndex, imageIndex),
      };
    }
  }
  return null;
}

function appendFileLog_(record) {
  getFilesSheet_().appendRow([
    safeCell_(record.submissionId),
    record.group,
    record.certificateIndex || '',
    record.imageIndex,
    record.fileName,
    record.mimeType,
    record.sizeBytes,
    record.sha256,
    record.fileId,
    record.uploadedAt,
    'ĐÃ LƯU',
  ]);
}

function listSubmissionFiles_(submissionId) {
  const sheet = getFilesSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, FILE_HEADERS.length).getValues();
  return values
    .filter(function (row) {
      return String(row[0]) === submissionId && String(row[10]) === 'ĐÃ LƯU';
    })
    .map(function (row) {
      const group = String(row[1]);
      const certificateIndex = Number(row[2] || 0);
      const imageIndex = Number(row[3] || 0);
      return {
        group: group,
        certificateIndex: certificateIndex,
        imageIndex: imageIndex,
        fileName: String(row[4]),
        mimeType: String(row[5]),
        sizeBytes: Number(row[6] || 0),
        sha256: String(row[7]),
        fileId: String(row[8]),
        slotKey: buildSlotKey_(group, certificateIndex, imageIndex),
      };
    });
}

function countFileGroups_(files, certificateCount) {
  const result = {
    hasFront: false,
    hasBack: false,
    cccdCount: 0,
    gcnCount: 0,
    perCertificate: {},
  };
  for (let i = 1; i <= certificateCount; i += 1) result.perCertificate[i] = 0;

  files.forEach(function (file) {
    if (file.group === 'CCCD_FRONT') {
      result.hasFront = true;
      result.cccdCount += 1;
    } else if (file.group === 'CCCD_BACK') {
      result.hasBack = true;
      result.cccdCount += 1;
    } else if (file.group === 'GCN') {
      result.gcnCount += 1;
      if (result.perCertificate[file.certificateIndex] != null) {
        result.perCertificate[file.certificateIndex] += 1;
      }
    }
  });
  return result;
}

function createManifestFile_(submission, files, completedAt) {
  const folder = DriveApp.getFolderById(submission.folderId);
  const lines = [
    APP_CONFIG.UNIT_NAME,
    APP_CONFIG.APP_NAME.toUpperCase(),
    '',
    'Mã hồ sơ: ' + submission.id,
    'Thời gian hoàn tất: ' + Utilities.formatDate(completedAt, APP_CONFIG.TIME_ZONE, 'dd/MM/yyyy HH:mm:ss'),
    'Họ và tên: ' + submission.fullName,
    'Số điện thoại: ' + submission.phone,
    'Số CCCD: ' + submission.citizenId,
    'Địa chỉ liên hệ: ' + submission.address,
    'Số lượng GCN: ' + submission.certificateCount,
    'Ghi chú: ' + (submission.note || 'Không có'),
    '',
    'DANH SÁCH TỆP ĐÃ NHẬN:',
  ];
  files
    .slice()
    .sort(function (a, b) {
      return a.fileName.localeCompare(b.fileName);
    })
    .forEach(function (file, index) {
      lines.push((index + 1) + '. ' + file.fileName + ' (' + file.sizeBytes + ' byte)');
    });
  lines.push('', 'Trạng thái đồng bộ: ' + SYNC_STATUS.PENDING);

  const existing = folder.getFilesByName('THONG_TIN_HO_SO.txt');
  while (existing.hasNext()) existing.next().setTrashed(true);
  folder.createFile('THONG_TIN_HO_SO.txt', lines.join('\n'), MimeType.PLAIN_TEXT);
}

function recordSubmissionError_(submissionId, message) {
  try {
    const row = findSubmissionRow_(submissionId);
    if (!row) return;
    const updates = {};
    updates[SUB_COL.LAST_ERROR] = normalizeText_(message, 500);
    updates[SUB_COL.LAST_ACTIVITY_EPOCH] = Date.now();
    updateSubmissionCells_(row, updates);
  } catch (error) {
    console.error('Unable to record submission error', error);
  }
}
