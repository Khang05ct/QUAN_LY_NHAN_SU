require('dotenv').config();

const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const {
  decryptDescriptor,
  encryptDescriptor,
  findUniqueMatch,
  parseEncryptionKey,
  validateDescriptor
} = require('./face-utils');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.APP_PORT || 3000);
const database = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'HRM_Pro',
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'local'
});

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function getPublicError(error) {
  if (error.code === 'ER_DUP_ENTRY') {
    return { status: 409, message: 'Email nhân viên đã tồn tại trong database.' };
  }
  if (['ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST'].includes(error.code)) {
    return { status: 503, message: 'Không kết nối được MySQL. Kiểm tra server và DB_HOST/DB_PORT trong .env.' };
  }
  if (error.code === 'ER_ACCESS_DENIED_ERROR') {
    return { status: 503, message: 'MySQL từ chối tài khoản. Kiểm tra DB_USER và DB_PASSWORD trong .env.' };
  }
  if (error.code === 'ER_NO_REFERENCED_ROW_2') {
    return { status: 404, message: 'Không tìm thấy nhân viên đang làm việc.' };
  }
  if (['ER_BAD_DB_ERROR', 'ER_NO_SUCH_TABLE'].includes(error.code)) {
    return { status: 503, message: 'Chưa có database hoặc bảng HRM_Pro. Hãy chạy database/hrm_schema.sql trong Workbench.' };
  }
  return {
    status: error.status || 500,
    message: error.status ? error.message : 'Lỗi máy chủ hoặc kết nối cơ sở dữ liệu.'
  };
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 65536) {
      const error = new Error('Dữ liệu gửi lên quá lớn.');
      error.status = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('Dữ liệu JSON không hợp lệ.');
    error.status = 400;
    throw error;
  }
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidTime(value) {
  return value === null || (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
}

async function handleApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/health') {
    await database.query('SELECT 1');
    return sendJson(response, 200, { status: 'ok' });
  }

  if (request.method === 'GET' && url.pathname === '/api/employees') {
    const [rows] = await database.execute(
      `SELECT employee_id AS id, full_name AS name, email, department,
              job_title AS role, 'Đang làm việc' AS status
       FROM employees
       WHERE employment_status = 'active'
       ORDER BY employee_id`
    );
    return sendJson(response, 200, rows);
  }

  if (request.method === 'POST' && url.pathname === '/api/employees') {
    const input = await readJson(request);
    const employee = {
      name: typeof input.name === 'string' ? input.name.trim() : '',
      email: typeof input.email === 'string' ? input.email.trim() : '',
      department: typeof input.department === 'string' ? input.department.trim() : '',
      role: typeof input.role === 'string' ? input.role.trim() : ''
    };
    if (!employee.name || !employee.email || !employee.department || !employee.role
      || employee.name.length > 150 || employee.email.length > 254
      || employee.department.length > 100 || employee.role.length > 150
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employee.email)) {
      return sendJson(response, 400, { error: 'Thông tin nhân viên không hợp lệ.' });
    }

    const [result] = await database.execute(
      `INSERT INTO employees (full_name, email, department, job_title)
       VALUES (?, ?, ?, ?)`,
      [employee.name, employee.email, employee.department, employee.role]
    );
    return sendJson(response, 201, {
      id: result.insertId,
      ...employee,
      status: 'Đang làm việc'
    });
  }

  if (request.method === 'GET' && url.pathname === '/api/face-templates') {
    const [rows] = await database.execute(
      `SELECT e.email, f.employee_id IS NOT NULL AS enrolled
       FROM employees e
       LEFT JOIN face_templates f
         ON f.employee_id = e.employee_id
        AND f.consent_revoked_at IS NULL
        AND (f.expires_at IS NULL OR f.expires_at > NOW(6))
       WHERE e.employment_status = 'active'
       ORDER BY e.employee_id`
    );
    return sendJson(response, 200, rows.map(row => ({
      email: row.email,
      enrolled: Boolean(row.enrolled)
    })));
  }

  if (request.method === 'PUT' && url.pathname === '/api/face-templates') {
    const input = await readJson(request);
    const email = typeof input.email === 'string' ? input.email.trim() : '';
    if (!email || input.consent !== true || input.templateFormatVersion !== 'face-api-v1') {
      return sendJson(response, 400, { error: 'Nhân viên phải xác nhận đồng ý và mẫu khuôn mặt phải hợp lệ.' });
    }
    const key = parseEncryptionKey(process.env.FACE_ENCRYPTION_KEY);
    const encrypted = encryptDescriptor(input.descriptor, key);
    const [employees] = await database.execute(
      'SELECT employee_id FROM employees WHERE email = ? AND employment_status = ?',
      [email, 'active']
    );
    if (!employees.length) {
      return sendJson(response, 404, { error: 'Không tìm thấy nhân viên đang làm việc.' });
    }
    await database.execute(
      `INSERT INTO face_templates
         (employee_id, encrypted_template, encryption_nonce, authentication_tag,
          encryption_key_version, template_format_version, consent_recorded_at,
          consent_revoked_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(6), NULL, DATE_ADD(NOW(6), INTERVAL 1 YEAR))
       ON DUPLICATE KEY UPDATE
         encrypted_template = VALUES(encrypted_template),
         encryption_nonce = VALUES(encryption_nonce),
         authentication_tag = VALUES(authentication_tag),
         encryption_key_version = VALUES(encryption_key_version),
         template_format_version = VALUES(template_format_version),
         consent_recorded_at = NOW(6),
         consent_revoked_at = NULL,
         expires_at = DATE_ADD(NOW(6), INTERVAL 1 YEAR)`,
      [
        employees[0].employee_id,
        encrypted.ciphertext,
        encrypted.nonce,
        encrypted.tag,
        process.env.FACE_ENCRYPTION_KEY_VERSION || 'v1',
        input.templateFormatVersion
      ]
    );
    return sendJson(response, 201, { status: 'enrolled' });
  }

  if (request.method === 'DELETE' && url.pathname === '/api/face-templates') {
    const input = await readJson(request);
    const email = typeof input.email === 'string' ? input.email.trim() : '';
    if (!email) return sendJson(response, 400, { error: 'Email nhân viên không hợp lệ.' });
    const [result] = await database.execute(
      `DELETE f FROM face_templates f
       JOIN employees e ON e.employee_id = f.employee_id
       WHERE e.email = ?`,
      [email]
    );
    if (!result.affectedRows) return sendJson(response, 404, { error: 'Không tìm thấy mẫu khuôn mặt.' });
    return sendJson(response, 200, { status: 'deleted' });
  }

  if (request.method === 'POST' && url.pathname === '/api/face-attendance') {
    const input = await readJson(request);
    const descriptor = validateDescriptor(input.descriptor);
    const key = parseEncryptionKey(process.env.FACE_ENCRYPTION_KEY);
    const [rows] = await database.execute(
      `SELECT e.employee_id AS employeeId, e.full_name AS name, e.email,
              f.encrypted_template AS encryptedTemplate,
              f.encryption_nonce AS nonce,
              f.authentication_tag AS authenticationTag
       FROM face_templates f
       JOIN employees e ON e.employee_id = f.employee_id
       WHERE e.employment_status = 'active'
         AND f.consent_revoked_at IS NULL
         AND (f.expires_at IS NULL OR f.expires_at > NOW(6))
       ORDER BY e.employee_id`
    );
    const match = findUniqueMatch(descriptor, rows.map(row => ({
      ...row,
      descriptor: decryptDescriptor(
        row.encryptedTemplate,
        row.nonce,
        row.authenticationTag,
        key
      )
    })));
    if (!match) {
      return sendJson(response, 404, {
        error: rows.length ? 'Không nhận diện rõ khuôn mặt. Hãy thử lại hoặc chấm công thủ công.' : 'Chưa có nhân viên đăng ký khuôn mặt.'
      });
    }

    const [employees] = await database.execute(
      `SELECT employee_id, CURRENT_DATE() AS workDate, NOW(6) AS checkedAt
       FROM employees WHERE email = ? AND employment_status = 'active'`,
      [match.email]
    );
    if (!employees.length) {
      return sendJson(response, 404, { error: 'Không tìm thấy nhân viên đang làm việc.' });
    }
    const employee = employees[0];
    const [existing] = await database.execute(
      'SELECT check_in_at FROM attendance WHERE employee_id = ? AND work_date = ?',
      [employee.employee_id, employee.workDate]
    );
    if (existing.length && existing[0].check_in_at) {
      return sendJson(response, 409, { error: `${match.name} đã chấm công vào hôm nay.` });
    }

    const checkInTime = new Date(employee.checkedAt);
    const checkInMinutes = checkInTime.getHours() * 60 + checkInTime.getMinutes();
    const shiftStart = typeof input.shiftStart === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.shiftStart)
      ? input.shiftStart.split(':').map(Number)
      : [8, 30];
    const graceMinutes = Number.isInteger(input.graceMinutes) && input.graceMinutes >= 0 && input.graceMinutes <= 120
      ? input.graceMinutes
      : 0;
    const state = checkInMinutes > shiftStart[0] * 60 + shiftStart[1] + graceMinutes
      ? 'late'
      : 'present';
    await database.execute(
      `INSERT INTO attendance
         (employee_id, work_date, check_in_at, attendance_status,
          attendance_method, verified_at)
       VALUES (?, ?, ?, ?, 'face_match', NOW(6))
       ON DUPLICATE KEY UPDATE
         check_in_at = VALUES(check_in_at),
         check_out_at = NULL,
         attendance_status = VALUES(attendance_status),
         attendance_method = 'face_match',
         verified_at = NOW(6)`,
      [employee.employee_id, employee.workDate, employee.checkedAt, state]
    );
    return sendJson(response, 200, {
      status: 'matched',
      email: match.email,
      name: match.name,
      state,
      time: checkInTime.toTimeString().slice(0, 5)
    });
  }

  if (request.method === 'GET' && url.pathname === '/api/attendance') {
    const workDate = url.searchParams.get('date');
    if (!isValidDate(workDate)) {
      return sendJson(response, 400, { error: 'Ngày chấm công không hợp lệ.' });
    }
    const [rows] = await database.execute(
      `SELECT e.email, a.attendance_status AS state,
              COALESCE(DATE_FORMAT(a.check_in_at, '%H:%i'), '—') AS \`in\`,
              COALESCE(DATE_FORMAT(a.check_out_at, '%H:%i'), '—') AS \`out\`,
              CASE
                WHEN a.check_in_at IS NULL OR a.check_out_at IS NULL THEN '—'
                ELSE CONCAT(FLOOR(TIMESTAMPDIFF(MINUTE, a.check_in_at, a.check_out_at) / 60),
                            ' giờ ',
                            LPAD(MOD(TIMESTAMPDIFF(MINUTE, a.check_in_at, a.check_out_at), 60), 2, '0'),
                            ' phút')
              END AS hours
       FROM employees e
       LEFT JOIN attendance a
         ON a.employee_id = e.employee_id AND a.work_date = ?
       WHERE e.employment_status = 'active'
       ORDER BY e.employee_id`,
      [workDate]
    );
    return sendJson(response, 200, rows.map(row => ({
      ...row,
      state: row.state || 'absent'
    })));
  }

  if (request.method === 'PUT' && url.pathname === '/api/attendance') {
    const input = await readJson(request);
    const workDate = input.workDate;
    const email = typeof input.email === 'string' ? input.email.trim() : '';
    const state = input.state;
    const checkIn = input.in === '—' ? null : input.in;
    const checkOut = input.out === '—' ? null : input.out;
    if (!email || !isValidDate(workDate) || !['present', 'late', 'absent'].includes(state)
      || !isValidTime(checkIn) || !isValidTime(checkOut)
      || (checkOut && !checkIn)) {
      return sendJson(response, 400, { error: 'Thông tin chấm công không hợp lệ.' });
    }

    const [employees] = await database.execute(
      'SELECT employee_id FROM employees WHERE email = ? AND employment_status = ?',
      [email, 'active']
    );
    if (!employees.length) {
      return sendJson(response, 404, { error: 'Không tìm thấy nhân viên đang làm việc.' });
    }

    const employeeId = employees[0].employee_id;
    const checkInAt = checkIn ? `${workDate} ${checkIn}:00` : null;
    const checkOutAt = checkOut ? `${workDate} ${checkOut}:00` : null;
    await database.execute(
      `INSERT INTO attendance
         (employee_id, work_date, check_in_at, check_out_at,
          attendance_status, attendance_method, verified_at)
       VALUES (?, ?, ?, ?, ?, 'manual', NOW(6))
       ON DUPLICATE KEY UPDATE
         check_in_at = VALUES(check_in_at),
         check_out_at = VALUES(check_out_at),
         attendance_status = VALUES(attendance_status),
         attendance_method = 'manual',
         verified_at = NOW(6)`,
      [employeeId, workDate, checkInAt, checkOutAt, state]
    );
    return sendJson(response, 200, { status: 'saved' });
  }

  return sendJson(response, 404, { error: 'Không tìm thấy API.' });
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      return await handleApi(request, response, url);
    }

    if (request.method === 'GET' && url.pathname === '/vendor/face-api.js') {
      const content = await readFile(path.join(root, 'node_modules', '@vladmandic', 'face-api', 'dist', 'face-api.js'));
      response.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
        'x-content-type-options': 'nosniff'
      });
      return response.end(content);
    }

    if (request.method === 'GET' && url.pathname.startsWith('/models/')) {
      const modelFile = path.basename(url.pathname);
      if (!/^(ssd_mobilenetv1|face_landmark_68|face_recognition)_model(-weights_manifest)?(\.json|\.bin)$/.test(modelFile)) {
        return sendJson(response, 404, { error: 'Không tìm thấy model.' });
      }
      const content = await readFile(path.join(root, 'node_modules', '@vladmandic', 'face-api', 'model', modelFile));
      response.writeHead(200, {
        'content-type': modelFile.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream',
        'x-content-type-options': 'nosniff'
      });
      return response.end(content);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return sendJson(response, 405, { error: 'Phương thức không được hỗ trợ.' });
    }
    const publicFiles = new Map([
      ['/', path.join('frontend', 'index.html')],
      ['/index.html', path.join('frontend', 'index.html')],
      ['/frontend/app.js', path.join('frontend', 'app.js')],
      ['/frontend/style.css', path.join('frontend', 'style.css')]
    ]);
    const relativeFile = publicFiles.get(url.pathname);
    if (!relativeFile) return sendJson(response, 404, { error: 'Không tìm thấy tệp.' });
    const content = await readFile(path.join(root, relativeFile));
    response.writeHead(200, {
      'content-type': relativeFile.endsWith('.html')
        ? 'text/html; charset=utf-8'
        : relativeFile.endsWith('.js')
          ? 'text/javascript; charset=utf-8'
          : 'text/css; charset=utf-8',
      'x-content-type-options': 'nosniff'
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return sendJson(response, 404, { error: 'Không tìm thấy tệp.' });
    }
    const publicError = getPublicError(error);
    console.error('Request failed:', error.code || error.status || 'UNKNOWN');
    if (!response.headersSent) {
      sendJson(response, publicError.status, { error: publicError.message });
    } else {
      response.destroy();
    }
  }
}

const server = createServer(handleRequest);
server.listen(port, '127.0.0.1', () => {
  console.log(`HRM Pro đang chạy tại http://127.0.0.1:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(async () => {
      await database.end();
      process.exit(0);
    });
  });
}
