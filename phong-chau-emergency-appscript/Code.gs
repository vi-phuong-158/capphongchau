/** Điểm vào Web App và API công khai gọi từ giao diện HTML. */

function doGet(e) {
  if (e && e.parameter && e.parameter.health === '1') {
    return ContentService.createTextOutput(
      JSON.stringify({
        ok: true,
        configured: isSystemConfigured_(),
        enabled: isSystemConfigured_() && isEmergencyEnabled_(),
        version: APP_CONFIG.CLIENT_VERSION,
        timestamp: new Date().toISOString(),
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  const template = HtmlService.createTemplateFromFile('Index');
  template.publicConfigJson = JSON.stringify(getPublicConfig_()).replace(/<\//g, '<\\/');
  return template
    .evaluate()
    .setTitle(APP_CONFIG.PAGE_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function getPublicConfig_() {
  return {
    appName: APP_CONFIG.APP_NAME,
    unitName: APP_CONFIG.UNIT_NAME,
    supportOfficer: APP_CONFIG.SUPPORT_OFFICER,
    supportPhone: APP_CONFIG.SUPPORT_PHONE,
    coverageNotice: APP_CONFIG.COVERAGE_NOTICE,
    consentText: APP_CONFIG.CONSENT_TEXT,
    configured: isSystemConfigured_(),
    enabled: isSystemConfigured_() && isEmergencyEnabled_(),
    maxCertificates: APP_CONFIG.MAX_CERTIFICATES_PER_SUBMISSION,
    maxImagesPerCertificate: APP_CONFIG.MAX_IMAGES_PER_CERTIFICATE,
    maxTotalFiles: APP_CONFIG.MAX_TOTAL_FILES,
    maxFileBytes: APP_CONFIG.MAX_FILE_BYTES,
    maxRawClientFileBytes: APP_CONFIG.MAX_RAW_CLIENT_FILE_BYTES,
    clientVersion: APP_CONFIG.CLIENT_VERSION,
  };
}

function startSubmission(rawPayload) {
  assertSystemConfigured_();
  assertEmergencyEnabled_();
  const payload = validateStartPayload_(rawPayload);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  let folder = null;
  try {
    assertRateLimit_(payload.phone, payload.deviceId);
    const now = new Date();
    const nowEpoch = now.getTime();
    const submissionId = nextSubmissionId_(now);
    const token = createUploadToken_();
    folder = createSubmissionFolder_(submissionId, payload.fullName, now);

    appendSubmission_({
      id: submissionId,
      startedAt: now,
      startedEpoch: nowEpoch,
      fullName: payload.fullName,
      phone: payload.phone,
      citizenId: payload.citizenId,
      address: payload.address,
      note: payload.note,
      certificateCount: payload.certificateCount,
      consentAccepted: payload.consentAccepted,
      completeImagesConfirmed: payload.completeImagesConfirmed,
      deviceId: payload.deviceId,
      tokenHash: hashToken_(token),
      folderId: folder.getId(),
      folderUrl: folder.getUrl(),
      clientVersion: payload.clientVersion,
      userAgent: payload.userAgent,
    });

    return {
      ok: true,
      submissionId: submissionId,
      token: token,
      status: STATUS.UPLOADING,
      uploadedSlots: [],
    };
  } catch (error) {
    if (folder) {
      try {
        folder.setTrashed(true);
      } catch (trashError) {
        console.error('Unable to trash failed submission folder', trashError);
      }
    }
    console.error('startSubmission failed', error);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function getSubmissionProgress(rawRequest) {
  assertSystemConfigured_();
  assertEmergencyEnabled_();
  const submissionId = normalizeText_(rawRequest && rawRequest.submissionId, 40);
  const token = normalizeText_(rawRequest && rawRequest.token, 120);
  const submission = readSubmission_(submissionId);
  verifySubmissionToken_(submission, token);

  const files = listSubmissionFiles_(submissionId);
  return {
    ok: true,
    submissionId: submissionId,
    status: submission.status,
    certificateCount: submission.certificateCount,
    uploadedSlots: files.map(function (file) {
      return file.slotKey;
    }),
    uploadedFileCount: files.length,
  };
}

function uploadSubmissionFile(rawRequest) {
  assertSystemConfigured_();
  assertEmergencyEnabled_();
  const submissionId = normalizeText_(rawRequest && rawRequest.submissionId, 40);

  try {
    let submission = readSubmission_(submissionId);
    const upload = validateUploadRequest_(rawRequest, submission);
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      submission = readSubmission_(submissionId);
      verifySubmissionToken_(submission, upload.token);
      if (submission.status !== STATUS.UPLOADING) {
        throwPublicError_('Hồ sơ không còn ở trạng thái tải ảnh.');
      }

      const existing = findFileLogBySlot_(
        submissionId,
        upload.group,
        upload.certificateIndex,
        upload.imageIndex
      );
      if (existing) {
        return {
          ok: true,
          duplicate: true,
          slotKey: existing.slotKey,
          fileName: existing.fileName,
        };
      }

      const currentFiles = listSubmissionFiles_(submissionId);
      if (currentFiles.length >= APP_CONFIG.MAX_TOTAL_FILES) {
        throwPublicError_('Hồ sơ đã đạt số lượng ảnh tối đa cho phép.');
      }

      const folder = DriveApp.getFolderById(submission.folderId);
      const fileName = buildStoredFileName_(
        submissionId,
        upload.group,
        upload.certificateIndex,
        upload.imageIndex,
        upload.extension
      );
      let file = null;
      try {
        file = folder.createFile(Utilities.newBlob(upload.bytes, upload.mimeType, fileName));
        file.setDescription(
          'Hồ sơ ' +
            submissionId +
            ' | ' +
            upload.group +
            ' | SHA-256 ' +
            upload.sha256
        );
        appendFileLog_({
          submissionId: submissionId,
          group: upload.group,
          certificateIndex: upload.certificateIndex,
          imageIndex: upload.imageIndex,
          fileName: fileName,
          mimeType: upload.mimeType,
          sizeBytes: upload.bytes.length,
          sha256: upload.sha256,
          fileId: file.getId(),
          uploadedAt: new Date(),
        });
      } catch (error) {
        if (file) {
          try {
            file.setTrashed(true);
          } catch (trashError) {
            console.error('Unable to trash failed file', trashError);
          }
        }
        throw error;
      }

      const updates = {};
      updates[SUB_COL.LAST_ACTIVITY_EPOCH] = Date.now();
      updates[SUB_COL.LAST_ERROR] = '';
      updateSubmissionCells_(submission.row, updates);

      return {
        ok: true,
        duplicate: false,
        slotKey: buildSlotKey_(upload.group, upload.certificateIndex, upload.imageIndex),
        fileName: fileName,
        sizeBytes: upload.bytes.length,
      };
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error('uploadSubmissionFile failed', submissionId, error);
    recordSubmissionError_(submissionId, error && error.message ? error.message : String(error));
    throw error;
  }
}

function finalizeSubmission(rawRequest) {
  assertSystemConfigured_();
  assertEmergencyEnabled_();
  const submissionId = normalizeText_(rawRequest && rawRequest.submissionId, 40);
  const token = normalizeText_(rawRequest && rawRequest.token, 120);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const submission = readSubmission_(submissionId);
    verifySubmissionToken_(submission, token);
    if (submission.status !== STATUS.UPLOADING) {
      throwPublicError_('Hồ sơ này đã được hoàn tất hoặc không còn hiệu lực.');
    }

    const files = listSubmissionFiles_(submissionId);
    if (files.length > APP_CONFIG.MAX_TOTAL_FILES) {
      throwPublicError_('Số lượng ảnh vượt quá giới hạn.');
    }

    const counts = countFileGroups_(files, submission.certificateCount);
    if (!counts.hasFront || !counts.hasBack) {
      throwPublicError_('Cần tải đủ ảnh CCCD mặt trước và mặt sau.');
    }
    for (let i = 1; i <= submission.certificateCount; i += 1) {
      if (!counts.perCertificate[i]) {
        throwPublicError_('Giấy chứng nhận số ' + i + ' chưa có ảnh.');
      }
    }

    const completedAt = new Date();
    createManifestFile_(submission, files, completedAt);

    const updates = {};
    updates[SUB_COL.COMPLETED_AT] = completedAt;
    updates[SUB_COL.STATUS] = STATUS.RECEIVED;
    updates[SUB_COL.CCCD_IMAGE_COUNT] = counts.cccdCount;
    updates[SUB_COL.GCN_IMAGE_COUNT] = counts.gcnCount;
    updates[SUB_COL.SYNC_STATUS] = SYNC_STATUS.PENDING;
    updates[SUB_COL.TOKEN_HASH] = '';
    updates[SUB_COL.LAST_ACTIVITY_EPOCH] = completedAt.getTime();
    updates[SUB_COL.LAST_ERROR] = '';
    updateSubmissionCells_(submission.row, updates);

    return {
      ok: true,
      submissionId: submissionId,
      completedAt: Utilities.formatDate(completedAt, APP_CONFIG.TIME_ZONE, 'dd/MM/yyyy HH:mm:ss'),
      cccdImageCount: counts.cccdCount,
      gcnImageCount: counts.gcnCount,
      supportOfficer: APP_CONFIG.SUPPORT_OFFICER,
      supportPhone: APP_CONFIG.SUPPORT_PHONE,
    };
  } catch (error) {
    console.error('finalizeSubmission failed', submissionId, error);
    recordSubmissionError_(submissionId, error && error.message ? error.message : String(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function cancelSubmission(rawRequest) {
  assertSystemConfigured_();
  const submissionId = normalizeText_(rawRequest && rawRequest.submissionId, 40);
  const token = normalizeText_(rawRequest && rawRequest.token, 120);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const submission = readSubmission_(submissionId);
    verifySubmissionToken_(submission, token);
    if (submission.status !== STATUS.UPLOADING) return { ok: true, status: submission.status };

    if (submission.folderId) {
      try {
        DriveApp.getFolderById(submission.folderId).setTrashed(true);
      } catch (error) {
        console.error('Unable to trash cancelled folder', error);
      }
    }
    const updates = {};
    updates[SUB_COL.STATUS] = STATUS.CANCELLED;
    updates[SUB_COL.TOKEN_HASH] = '';
    updates[SUB_COL.LAST_ACTIVITY_EPOCH] = Date.now();
    updateSubmissionCells_(submission.row, updates);
    return { ok: true, status: STATUS.CANCELLED };
  } finally {
    lock.releaseLock();
  }
}

function assertRateLimit_(phone, deviceId) {
  const sheet = getSubmissionsSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const scanCount = Math.min(APP_CONFIG.RATE_LIMIT_SCAN_ROWS, lastRow - 1);
  const startRow = lastRow - scanCount + 1;
  const values = sheet
    .getRange(startRow, SUB_COL.PHONE, scanCount, SUB_COL.STARTED_EPOCH - SUB_COL.PHONE + 1)
    .getValues();
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  let phoneHour = 0;
  let deviceHour = 0;
  let phoneDay = 0;
  let deviceDay = 0;

  values.forEach(function (row) {
    const rowPhone = String(row[0] || '');
    const rowDevice = String(row[SUB_COL.DEVICE_ID - SUB_COL.PHONE] || '');
    const startedEpoch = Number(row[SUB_COL.STARTED_EPOCH - SUB_COL.PHONE] || 0);
    if (!startedEpoch || startedEpoch < oneDayAgo) return;
    if (rowPhone === phone) phoneDay += 1;
    if (rowDevice === deviceId) deviceDay += 1;
    if (startedEpoch >= oneHourAgo) {
      if (rowPhone === phone) phoneHour += 1;
      if (rowDevice === deviceId) deviceHour += 1;
    }
  });

  if (
    phoneHour >= APP_CONFIG.MAX_STARTS_PER_PHONE_PER_HOUR ||
    deviceHour >= APP_CONFIG.MAX_STARTS_PER_DEVICE_PER_HOUR ||
    phoneDay >= APP_CONFIG.MAX_STARTS_PER_PHONE_PER_DAY ||
    deviceDay >= APP_CONFIG.MAX_STARTS_PER_DEVICE_PER_DAY
  ) {
    throwPublicError_(
      'Thiết bị hoặc số điện thoại đã tạo nhiều hồ sơ trong thời gian ngắn. ' +
        'Vui lòng tiếp tục hồ sơ đang tải hoặc liên hệ cán bộ hỗ trợ.'
    );
  }
}
