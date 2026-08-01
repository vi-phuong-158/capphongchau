/** Các hàm kiểm tra đầu vào và bảo vệ cơ bản. */

function normalizeText_(value, maxLength) {
  const text = String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, maxLength);
}

function safeCell_(value) {
  const text = String(value == null ? '' : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function validateStartPayload_(raw) {
  if (!raw || typeof raw !== 'object') {
    throwPublicError_('Dữ liệu gửi lên không hợp lệ.');
  }

  const now = Date.now();
  const fullName = normalizeText_(raw.fullName, 120);
  const phone = String(raw.phone || '').replace(/\D/g, '').slice(0, 10);
  const citizenId = String(raw.citizenId || '').replace(/\D/g, '').slice(0, 12);
  const address = normalizeText_(raw.address, 250);
  const note = normalizeText_(raw.note, 500);
  const deviceId = normalizeText_(raw.deviceId, 80);
  const userAgent = normalizeText_(raw.userAgent, 300);
  const certificateCount = Number(raw.certificateCount);
  const startedAt = Number(raw.formStartedAt);

  if (normalizeText_(raw.website, 200)) {
    throwPublicError_('Không thể tiếp nhận yêu cầu này.');
  }
  if (fullName.length < 2) {
    throwPublicError_('Vui lòng nhập đầy đủ họ và tên.');
  }
  if (!/^0\d{9}$/.test(phone)) {
    throwPublicError_('Số điện thoại phải gồm 10 số và bắt đầu bằng 0.');
  }
  if (!/^\d{12}$/.test(citizenId)) {
    throwPublicError_('Số CCCD phải gồm đúng 12 chữ số.');
  }
  if (address.length < 5) {
    throwPublicError_('Vui lòng nhập địa chỉ liên hệ đầy đủ hơn.');
  }
  if (
    !Number.isInteger(certificateCount) ||
    certificateCount < 1 ||
    certificateCount > APP_CONFIG.MAX_CERTIFICATES_PER_SUBMISSION
  ) {
    throwPublicError_(
      'Mỗi lượt chỉ nhận từ 1 đến ' +
        APP_CONFIG.MAX_CERTIFICATES_PER_SUBMISSION +
        ' Giấy chứng nhận.'
    );
  }
  if (raw.consentAccepted !== true) {
    throwPublicError_('Cần đồng ý cung cấp thông tin để tiếp tục.');
  }
  if (raw.completeImagesConfirmed !== true) {
    throwPublicError_('Cần xác nhận đã chuẩn bị đầy đủ ảnh giấy tờ.');
  }
  if (!deviceId || !/^[A-Za-z0-9_-]{16,80}$/.test(deviceId)) {
    throwPublicError_('Không xác định được thiết bị gửi hồ sơ. Vui lòng tải lại trang.');
  }
  if (!Number.isFinite(startedAt) || now - startedAt < APP_CONFIG.MIN_FORM_AGE_SECONDS * 1000) {
    throwPublicError_('Vui lòng kiểm tra lại thông tin trước khi gửi.');
  }
  if (now - startedAt > 24 * 60 * 60 * 1000) {
    throwPublicError_('Phiên kê khai đã hết hạn. Vui lòng tải lại trang.');
  }

  return {
    fullName: fullName,
    phone: phone,
    citizenId: citizenId,
    address: address,
    note: note,
    deviceId: deviceId,
    userAgent: userAgent,
    certificateCount: certificateCount,
    consentAccepted: true,
    completeImagesConfirmed: true,
    clientVersion: normalizeText_(raw.clientVersion, 30) || APP_CONFIG.CLIENT_VERSION,
  };
}

function validateUploadRequest_(raw, submission) {
  if (!raw || typeof raw !== 'object') {
    throwPublicError_('Dữ liệu ảnh không hợp lệ.');
  }

  const submissionId = normalizeText_(raw.submissionId, 40);
  const token = normalizeText_(raw.token, 120);
  const group = normalizeText_(raw.group, 30).toUpperCase();
  const certificateIndex = Number(raw.certificateIndex || 0);
  const imageIndex = Number(raw.imageIndex || 0);
  const dataUrl = String(raw.dataUrl || '');

  if (submissionId !== submission.id) {
    throwPublicError_('Mã hồ sơ không hợp lệ.');
  }
  verifySubmissionToken_(submission, token);
  if (submission.status !== STATUS.UPLOADING) {
    throwPublicError_('Hồ sơ này không còn ở trạng thái tải ảnh.');
  }

  if (group === 'CCCD_FRONT' || group === 'CCCD_BACK') {
    if (certificateIndex !== 0 || imageIndex !== 1) {
      throwPublicError_('Vị trí ảnh CCCD không hợp lệ.');
    }
  } else if (group === 'GCN') {
    if (
      !Number.isInteger(certificateIndex) ||
      certificateIndex < 1 ||
      certificateIndex > submission.certificateCount
    ) {
      throwPublicError_('Số thứ tự Giấy chứng nhận không hợp lệ.');
    }
    if (
      !Number.isInteger(imageIndex) ||
      imageIndex < 1 ||
      imageIndex > APP_CONFIG.MAX_IMAGES_PER_CERTIFICATE
    ) {
      throwPublicError_('Số thứ tự ảnh Giấy chứng nhận không hợp lệ.');
    }
  } else {
    throwPublicError_('Nhóm ảnh không được hỗ trợ.');
  }

  const parsed = parseAndValidateImageDataUrl_(dataUrl);
  return {
    submissionId: submissionId,
    token: token,
    group: group,
    certificateIndex: certificateIndex,
    imageIndex: imageIndex,
    bytes: parsed.bytes,
    mimeType: parsed.mimeType,
    extension: parsed.extension,
    sha256: sha256Hex_(parsed.bytes),
  };
}

function parseAndValidateImageDataUrl_(dataUrl) {
  const match = /^data:([A-Za-z0-9.+\-/]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match) {
    throwPublicError_('Không đọc được dữ liệu ảnh.');
  }

  const encoded = match[2].replace(/[\r\n]/g, '');
  const approximateBytes = Math.floor((encoded.length * 3) / 4);
  if (approximateBytes <= 0 || approximateBytes > APP_CONFIG.MAX_FILE_BYTES + 4) {
    throwPublicError_(
      'Ảnh vượt quá ' + Math.round(APP_CONFIG.MAX_FILE_BYTES / 1024 / 1024) + ' MB sau khi xử lý.'
    );
  }

  let bytes;
  try {
    bytes = Utilities.base64Decode(encoded);
  } catch (error) {
    console.error('base64Decode failed', error);
    throwPublicError_('Ảnh bị lỗi hoặc không đọc được.');
  }

  if (bytes.length <= 0 || bytes.length > APP_CONFIG.MAX_FILE_BYTES) {
    throwPublicError_('Dung lượng ảnh không hợp lệ.');
  }

  const detected = detectImageType_(bytes);
  if (!detected) {
    throwPublicError_('Chỉ chấp nhận ảnh JPG, PNG, WEBP, HEIC hoặc AVIF hợp lệ.');
  }

  return {
    bytes: bytes,
    mimeType: detected.mimeType,
    extension: detected.extension,
  };
}

function detectImageType_(bytes) {
  const u = bytes.map(function (value) {
    return value < 0 ? value + 256 : value;
  });

  if (u.length >= 3 && u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }
  if (
    u.length >= 8 &&
    u[0] === 0x89 &&
    u[1] === 0x50 &&
    u[2] === 0x4e &&
    u[3] === 0x47 &&
    u[4] === 0x0d &&
    u[5] === 0x0a &&
    u[6] === 0x1a &&
    u[7] === 0x0a
  ) {
    return { mimeType: 'image/png', extension: 'png' };
  }
  if (
    u.length >= 12 &&
    asciiFromBytes_(u, 0, 4) === 'RIFF' &&
    asciiFromBytes_(u, 8, 4) === 'WEBP'
  ) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }
  if (u.length >= 12 && asciiFromBytes_(u, 4, 4) === 'ftyp') {
    const brand = asciiFromBytes_(u, 8, 4).toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].indexOf(brand) >= 0) {
      return { mimeType: 'image/heic', extension: 'heic' };
    }
    if (['avif', 'avis'].indexOf(brand) >= 0) {
      return { mimeType: 'image/avif', extension: 'avif' };
    }
  }
  return null;
}

function asciiFromBytes_(bytes, start, length) {
  let result = '';
  for (let i = start; i < start + length && i < bytes.length; i += 1) {
    result += String.fromCharCode(bytes[i]);
  }
  return result;
}

function createUploadToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function hashToken_(token) {
  return sha256Hex_(Utilities.newBlob(String(token)).getBytes());
}

function sha256Hex_(bytes) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return digest
    .map(function (value) {
      const unsigned = value < 0 ? value + 256 : value;
      return ('0' + unsigned.toString(16)).slice(-2);
    })
    .join('');
}

function verifySubmissionToken_(submission, token) {
  if (!token || !submission.tokenHash || hashToken_(token) !== submission.tokenHash) {
    throwPublicError_('Phiên tải ảnh không hợp lệ hoặc đã hết hạn.');
  }
}

function makeSafeFolderName_(value) {
  const normalized = normalizeText_(value, 100)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 _-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'NGUOI-KE-KHAI';
}

function throwPublicError_(message) {
  throw new Error(String(message || 'Không thể xử lý yêu cầu.'));
}
