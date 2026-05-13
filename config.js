/**
 * 勤怠管理システム - 設定ファイル
 */

// スプレッドシートID（直接指定）
var SPREADSHEET_ID = '1biJFf7-tB87xWPeUTx5v325WFxiWLKotGqlWusQqqBlrZPgDSe4mO4zA';

// シート名定義
var SHEET_NAMES = {
  EMPLOYEES: '従業員マスタ',
  WORK_PATTERNS: '勤務形態マスタ',
  LEAVE_TYPES: '休暇種類マスタ',
  CALENDAR: 'カレンダーマスタ',
  AGREEMENT_36: '36協定設定',
  ATTENDANCE: '勤怠記録',
  LEAVE_REQUESTS: '休暇申請',
  LEAVE_BALANCE: '休暇残数',
  MONTHLY_SUMMARY: '月次集計',
  SETTINGS: '設定',
  DOCUMENTS: 'ドキュメント'
};

// 列インデックス定義（0始まり）
var COLUMNS = {
  EMPLOYEES: {
    ID: 0,
    NAME: 1,
    EMAIL: 2,
    DEPARTMENT: 3,
    POSITION: 4,
    WORK_PATTERN_ID: 5,
    HIRE_DATE: 6,
    MANAGER_ID: 7,
    ROLE: 8,
    STATUS: 9
  },
  WORK_PATTERNS: {
    ID: 0,
    NAME: 1,
    START_TIME: 2,
    END_TIME: 3,
    BREAK_MINUTES: 4,
    SCHEDULED_HOURS: 5,
    IS_FLEX: 6,
    CORE_START: 7,
    CORE_END: 8,
    NOTE: 9
  },
  ATTENDANCE: {
    RECORD_ID: 0,
    EMPLOYEE_ID: 1,
    DATE: 2,
    CLOCK_IN: 3,
    CLOCK_OUT: 4,
    BREAK_MINUTES: 5,
    WORK_PATTERN_ID: 6,
    WORK_TYPE: 7,
    SCHEDULED_HOURS: 8,
    ACTUAL_HOURS: 9,
    OVERTIME_HOURS: 10,
    NIGHT_HOURS: 11,
    HOLIDAY_HOURS: 12,
    NOTE: 13,
    PUNCH_METHOD: 14,
    UPDATED_AT: 15
  },
  LEAVE_REQUESTS: {
    REQUEST_ID: 0,
    EMPLOYEE_ID: 1,
    LEAVE_TYPE_ID: 2,
    START_DATE: 3,
    END_DATE: 4,
    UNIT: 5,
    HOURS: 6,
    REQUESTED_AT: 7,
    REASON: 8,
    STATUS: 9,
    APPROVER_ID: 10,
    APPROVED_AT: 11,
    APPROVER_COMMENT: 12,
    DAYS_TAKEN: 13
  },
  LEAVE_BALANCE: {
    EMPLOYEE_ID: 0,
    LEAVE_TYPE_ID: 1,
    YEAR: 2,
    CARRIED_OVER: 3,
    GRANTED: 4,
    USED: 5,
    REMAINING: 6,
    UPDATED_AT: 7
  }
};

// ステータス定義
var STATUS = {
  LEAVE_REQUEST: {
    PENDING: '申請中',
    APPROVED: '承認',
    REJECTED: '却下',
    CANCELLED: '取消'
  },
  EMPLOYEE: {
    ACTIVE: '在籍',
    LEAVE: '休職',
    RETIRED: '退職'
  },
  AGREEMENT_36: {
    NORMAL: '正常',
    WARNING: '警告',
    EXCEEDED: '超過'
  }
};

// 勤務区分
var WORK_TYPES = {
  NORMAL: '通常',
  HOLIDAY_WORK: '休日出勤',
  SUBSTITUTE: '代休',
  PAID_LEAVE: '有給'
};

// 取得単位
var LEAVE_UNITS = {
  FULL_DAY: '全日',
  AM: '午前',
  PM: '午後',
  HOURLY: '時間'
};

/**
 * スプレッドシートを取得
 */
function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * システム設定を取得
 */
function getSystemSettings() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  
  if (!sheet) {
    return {};
  }
  
  var data = sheet.getDataRange().getValues();
  var settings = {};
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) {
      settings[data[i][0]] = data[i][1];
    }
  }
  
  return settings;
}

/**
 * 設定値を取得
 */
function getSetting(key, defaultValue) {
  if (defaultValue === undefined) {
    defaultValue = null;
  }
  
  var settings = getSystemSettings();
  
  if (settings[key] !== undefined && settings[key] !== null && settings[key] !== '') {
    return settings[key];
  }
  
  return defaultValue;
}
