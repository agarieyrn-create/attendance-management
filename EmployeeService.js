/**
 * 勤怠管理システム - 従業員サービス
 */

/**
 * 全従業員を取得
 */
function getAllEmployees() {
  const data = getSheetData(SHEET_NAMES.EMPLOYEES);
  return data.map(row => rowToEmployee(row));
}

/**
 * 在籍中の従業員を取得
 */
function getActiveEmployees() {
  return getAllEmployees().filter(emp => emp.status === STATUS.EMPLOYEE.ACTIVE);
}

/**
 * 社員IDで従業員を取得
 */
function getEmployeeById(employeeId) {
  const employees = getAllEmployees();
  return employees.find(emp => emp.id === employeeId) || null;
}

/**
 * メールアドレスで従業員を取得
 */
function getEmployeeByEmail(email) {
  const employees = getAllEmployees();
  return employees.find(emp => emp.email === email) || null;
}

/**
 * 部署で従業員を取得
 */
function getEmployeesByDepartment(department) {
  return getActiveEmployees().filter(emp => emp.department === department);
}

/**
 * 上長IDで部下を取得
 */
function getSubordinates(managerId) {
  return getActiveEmployees().filter(emp => emp.managerId === managerId);
}

/**
 * 行データを従業員オブジェクトに変換
 */
function rowToEmployee(row) {
  var cols = COLUMNS.EMPLOYEES;
  var hireDate = row[cols.HIRE_DATE];
  
  // Dateオブジェクトを文字列に変換
  if (hireDate instanceof Date) {
    hireDate = formatDate(hireDate);
  }
  
  return {
    id: row[cols.ID],
    name: row[cols.NAME],
    email: row[cols.EMAIL],
    department: row[cols.DEPARTMENT],
    position: row[cols.POSITION],
    workPatternId: row[cols.WORK_PATTERN_ID],
    hireDate: hireDate,
    managerId: row[cols.MANAGER_ID],
    role: row[cols.ROLE],
    status: row[cols.STATUS]
  };
}


/**
 * 勤務形態を取得
 */
function getWorkPattern(workPatternId) {
  const data = getSheetData(SHEET_NAMES.WORK_PATTERNS);
  const cols = COLUMNS.WORK_PATTERNS;
  
  for (const row of data) {
    if (row[cols.ID] === workPatternId) {
      return {
        id: row[cols.ID],
        name: row[cols.NAME],
        startTime: row[cols.START_TIME],
        endTime: row[cols.END_TIME],
        breakMinutes: row[cols.BREAK_MINUTES],
        scheduledHours: row[cols.SCHEDULED_HOURS],
        isFlex: row[cols.IS_FLEX] === 'あり',
        coreStart: row[cols.CORE_START],
        coreEnd: row[cols.CORE_END],
        note: row[cols.NOTE]
      };
    }
  }
  return null;
}

/**
 * 全勤務形態を取得
 */
function getAllWorkPatterns() {
  const data = getSheetData(SHEET_NAMES.WORK_PATTERNS);
  const cols = COLUMNS.WORK_PATTERNS;
  
  return data.map(row => ({
    id: row[cols.ID],
    name: row[cols.NAME],
    startTime: formatTime(row[cols.START_TIME]),
    endTime: formatTime(row[cols.END_TIME]),
    breakMinutes: row[cols.BREAK_MINUTES],
    scheduledHours: row[cols.SCHEDULED_HOURS],
    isFlex: row[cols.IS_FLEX] === 'あり',
    coreStart: formatTime(row[cols.CORE_START]),
    coreEnd: formatTime(row[cols.CORE_END]),
    note: row[cols.NOTE]
  }));
}

/**
 * 従業員の勤続年数を計算
 */
function calculateYearsOfService(employeeId, asOfDate = null) {
  const employee = getEmployeeById(employeeId);
  if (!employee || !employee.hireDate) return 0;
  
  const hireDate = new Date(employee.hireDate);
  const targetDate = asOfDate ? new Date(asOfDate) : new Date();
  
  let years = targetDate.getFullYear() - hireDate.getFullYear();
  const monthDiff = targetDate.getMonth() - hireDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && targetDate.getDate() < hireDate.getDate())) {
    years--;
  }
  
  return Math.max(0, years);
}

/**
 * 有給休暇の法定付与日数を計算
 */
function calculateLegalPaidLeaveDays(yearsOfService) {
  // 労働基準法に基づく付与日数
  const table = [
    { years: 0.5, days: 10 },
    { years: 1.5, days: 11 },
    { years: 2.5, days: 12 },
    { years: 3.5, days: 14 },
    { years: 4.5, days: 16 },
    { years: 5.5, days: 18 },
    { years: 6.5, days: 20 }
  ];
  
  for (let i = table.length - 1; i >= 0; i--) {
    if (yearsOfService >= table[i].years) {
      return table[i].days;
    }
  }
  return 0;
}

/**
 * 従業員の権限チェック
 */
function hasPermission(employeeId, requiredRole) {
  const employee = getEmployeeById(employeeId);
  if (!employee) return false;
  
  const roleHierarchy = {
    'admin': 3,
    'manager': 2,
    'user': 1
  };
  
  const userLevel = roleHierarchy[employee.role] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;
  
  return userLevel >= requiredLevel;
}

/**
 * 承認権限チェック（申請者の上長かどうか）
 */
function canApprove(approverId, applicantId) {
  // 管理者は全員承認可能
  if (hasPermission(approverId, 'admin')) return true;
  
  // 申請者の上長かチェック
  const applicant = getEmployeeById(applicantId);
  if (applicant && applicant.managerId === approverId) return true;
  
  return false;
}
