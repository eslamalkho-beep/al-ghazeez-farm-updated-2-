// js/services/totp-service.js
// التحقق بخطوتين (2FA) عبر تطبيق مصادقة على الموبايل (Google Authenticator/Microsoft Authenticator/Authy...) —
// تطبيق كامل من جهة العميل بلا أي خادم (نفس قيد المشروع)، فلا مجال لإرسال كود عبر SMS/إيميل فعليًا؛ TOTP
// (خوارزمية RFC 6238 القياسية، بلا اتصال بأي خادم) هو الخيار العملي الوحيد الممكن هنا. السرّ يُنشأ محليًا
// ويُخزَّن نصًا صريحًا في Users.twoFactorSecret (نفس مستوى الأمان المُقرّ به في auth-service.js لكلمة المرور
// المُخزَّنة بدون salt/تشفير جلسة — تطبيق محلي أحادي الجهاز)، ويُستهلك حصرًا عبر verifyTotpCode() هنا.
// يعتمد على crypto.subtle (نفس ما يستخدمه hashPassword() في auth-service.js أصلاً لهاش كلمة المرور).

const TOTP_DIGITS = 6;
const TOTP_PERIOD_SECONDS = 30;
const _BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function _base32Encode(bytes) {
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let output = '';
  for (let i = 0; i < bits.length; i += 5) {
    let chunk = bits.slice(i, i + 5);
    if (chunk.length < 5) chunk = chunk.padEnd(5, '0');
    output += _BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return output;
}

// يقبل السرّ بأي تنسيق يكتبه مستخدم يدويًا (حروف صغيرة/مسافات/شرطات فاصلة) لا فقط الناتج من _base32Encode
function _base32Decode(input) {
  const clean = String(input || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) {
    const val = _BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

// عدّاد 8 بايت big-endian (RFC 4226) — النصف الأعلى صفر دومًا عمليًا (Unix time / 30 ثانية لن يتجاوز حدود
// 32-بت إلا بعد آلاف السنين)
function _counterToBytes(counter) {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, 0, false);
  view.setUint32(4, counter, false);
  return new Uint8Array(buf);
}

async function _hmacSha1(keyBytes, msgBytes) {
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgBytes);
  return new Uint8Array(signature);
}

// اقتطاع ديناميكي (RFC 4226 §5.3) لاستخراج رقم الكود من ناتج HMAC
function _dynamicTruncate(hmacBytes, digits) {
  const offset = hmacBytes[hmacBytes.length - 1] & 0x0f;
  const binCode =
    ((hmacBytes[offset] & 0x7f) << 24) |
    ((hmacBytes[offset + 1] & 0xff) << 16) |
    ((hmacBytes[offset + 2] & 0xff) << 8) |
    (hmacBytes[offset + 3] & 0xff);
  const otp = binCode % (10 ** digits);
  return String(otp).padStart(digits, '0');
}

// سرّ عشوائي جديد لكل مستخدم (20 بايت = 160-بت، نفس طول السرّ الافتراضي في Google Authenticator)
function generateTotpSecret(byteLength = 20) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return _base32Encode(bytes);
}

async function computeTotpCode(secretBase32, options = {}) {
  const digits = options.digits || TOTP_DIGITS;
  const period = options.period || TOTP_PERIOD_SECONDS;
  const timestamp = options.timestamp !== undefined ? options.timestamp : Date.now();
  const counter = Math.floor(timestamp / 1000 / period);
  const keyBytes = _base32Decode(secretBase32);
  const hmac = await _hmacSha1(keyBytes, _counterToBytes(counter));
  return _dynamicTruncate(hmac, digits);
}

// يقبل انحرافًا زمنيًا بسيط بين الموبايل والجهاز (نافذة ±1 خطوة = ±30 ثانية افتراضيًا) — نفس هامش التسامح
// المعتاد في تطبيقات TOTP القياسية (Google Authenticator وغيره)
async function verifyTotpCode(secretBase32, token, options = {}) {
  const cleanToken = String(token || '').trim().replace(/\s+/g, '');
  if (!/^\d{6,8}$/.test(cleanToken)) return false;
  const digits = options.digits || TOTP_DIGITS;
  const period = options.period || TOTP_PERIOD_SECONDS;
  const window = options.window !== undefined ? options.window : 1;
  const now = options.timestamp !== undefined ? options.timestamp : Date.now();

  for (let step = -window; step <= window; step++) {
    const ts = now + step * period * 1000;
    const expected = await computeTotpCode(secretBase32, { digits, period, timestamp: ts });
    if (expected === cleanToken) return true;
  }
  return false;
}

// رابط otpauth:// القياسي — يمسحه أي تطبيق مصادقة كـ QR Code فيضبط الحساب تلقائيًا (الاسم/المُصدر/السرّ)
function buildTotpAuthUri(secretBase32, accountLabel, issuer) {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// تقسيم السرّ لمجموعات 4 أحرف لسهولة قراءته/كتابته يدويًا (بديل مسح QR في تطبيق المصادقة)
function formatSecretForDisplay(secretBase32) {
  return String(secretBase32 || '').replace(/(.{4})/g, '$1 ').trim();
}

// ===== رموز احتياطية للاستخدام مرة واحدة (Recovery Codes) — تُنشأ لحظة تفعيل/ربط 2FA (انظر settings-page.js)
// وتُعرض نصًا صريحًا **مرة واحدة فقط** ليحفظها المستخدم بمكان آمن (ورقة/مدير كلمات مرور). الحل الوحيد لموقف
// "فقدت الجوال ولا يوجد مدير نظام آخر يوقف 2FA عني" — بلا هذه الرموز يبقى الحساب مقفولاً تمامًا بلا أي استرجاع
// ممكن في تطبيق محلي بلا خادم. تُخزَّن مُجزّأة (SHA-256، مثل passwordHash) في Users.twoFactorRecoveryCodeHashes
// لا نصًا صريحًا؛ كل رمز يُستهلك ويُحذف من القائمة بعد أول استخدام ناجح (completeTwoFactorLogin في auth-service.js) =====

const _RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بلا أحرف/أرقام ملتبسة بصريًا (I/O/0/1)
const RECOVERY_CODE_PATTERN = /^[A-Z2-9]{5}-[A-Z2-9]{5}$/i;

function _randomRecoveryChars(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += _RECOVERY_CODE_ALPHABET[bytes[i] % _RECOVERY_CODE_ALPHABET.length];
  return out;
}

// دفعة رموز جديدة (نص صريح) — يستدعيها الطرف المستدعي عند التفعيل الأول أو عند طلب "توليد رموز جديدة"
// (يُبطل القديمة تلقائيًا لأنها تستبدل twoFactorRecoveryCodeHashes بالكامل، لا تُضاف إليها)
function generateRecoveryCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    codes.push(`${_randomRecoveryChars(5)}-${_randomRecoveryChars(5)}`);
  }
  return codes;
}

// نفس أسلوب hashPassword() في auth-service.js (SHA-256 عبر crypto.subtle، نصف الحالة موحّد قبل الهاش
// (trim + توحيد كبير) حتى لا يفشل التطابق بسبب اختلاف حالة الأحرف أو مسافة زائدة عند إعادة الكتابة يدويًا)
async function hashRecoveryCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashRecoveryCodes(codes) {
  return Promise.all(codes.map(hashRecoveryCode));
}

// تتحقق من رمز احتياطي واحد مقابل قائمة الهاشات المحفوظة — تُعيد الهاش المطابق (لحذفه من القائمة عند
// الاستهلاك) أو null. لا تحذف بنفسها — الحذف الفعلي مسؤولية الطرف المستدعي (يحتاج معرفة سياق الحفظ في Users)
async function matchRecoveryCode(code, storedHashes) {
  if (!Array.isArray(storedHashes) || !storedHashes.length) return null;
  if (!RECOVERY_CODE_PATTERN.test(String(code || '').trim())) return null;
  const hash = await hashRecoveryCode(code);
  return storedHashes.includes(hash) ? hash : null;
}
