/**
 * 勤怠管理システム - 勤怠サービス
 */

/**
 * 出勤打刻
 */
function clockIn(employeeId, punchMethod = 'Web', note = '') {
  const employee = getEmployeeById(employeeId);
  if (!employee) {
    return errorResponse('従業員が見つかりません', 'EMPLOYEE_NOT_FOUND');
  }
  
  const now = getNow();
  const today = formatDate(now);
  
  // 既に出勤打刻があるかチェック
  const existingRecord = getAttendanceRecord(employeeId, today);
  if (existingRecord && existingRecord.clockIn) {
    return errorResponse('本日は既に出勤打刻済みです', 'ALREADY_CLOCKED_IN');
  }
  
  const workPattern = getWorkPattern(employee.workPatternId);
  const recordId = generateId('ATT');
  const workType = isWorkingDay(now) ? WORK_TYPES.NORMAL : WORK_TYPES.HOLIDAY_WORK;
  
  const rowData = [
    recordId,                           // 記録ID
    employeeId,                         // 社員ID
    today,                              // 日付
    formatTime(now),                    // 出勤時刻
    '',                                 // 退勤時刻
    workPattern ? workPattern.breakMinutes : 60, // 休憩時間
    employee.workPatternId,             // 勤務形態ID
    workType,                           // 勤務区分
    workPattern ? workPattern.scheduledHours : '8:00', // 所定労働時間
    '',                                 // 実労働時間
    '',                                 // 残業時間
    '',                                 // 深夜残業時間
    '',                                 // 休日労働時間
    note,                               // 備考
    punchMethod,                        // 打刻方法
    formatDateTime(now)                 // 更新日時
  ];
  
  appendToSheet(SHEET_NAMES.ATTENDANCE, rowData);
  
  return successResponse({
    recordId: recordId,
    employeeId: employeeId,
    employeeName: employee.name,
    date: today,
    clockIn: formatTime(now),
    workType: workType
  }, '出勤打刻が完了しました');
}

/**
 * 退勤打刻
 */
function clockOut(employeeId, punchMethod = 'Web', note = '') {
  const employee = getEmployeeById(employeeId);
  if (!employee) {
    return errorResponse('従業員が見つかりません', 'EMPLOYEE_NOT_FOUND');
  }
  
  const now = getNow();
  const today = formatDate(now);
  
  // 出勤打刻があるかチェック
  const existingRecord = getAttendanceRecord(employeeId, today);
  if (!existingRecord) {
    return errorResponse('本日の出勤打刻がありません', 'NOT_CLOCKED_IN');
  }
  if (existingRecord.clockOut) {
    return errorResponse('本日は既に退勤打刻済みです', 'ALREADY_CLOCKED_OUT');
  }
  
  // 勤務時間を計算
  const workPattern = getWorkPattern(employee.workPatternId);
  const calculatedTimes = calculateWorkingTimes(
    existingRecord.clockIn,
    formatTime(now),
    existingRecord.breakMinutes,
    workPattern
  );
  
  // レコードを更新
  updateAttendanceRecord(existingRecord.recordId, {
    clockOut: formatTime(now),
    actualHours: calculatedTimes.actualHours,
    overtimeHours: calculatedTimes.overtimeHours,
    nightHours: calculatedTimes.nightHours,
    holidayHours: existingRecord.workType === WORK_TYPES.HOLIDAY_WORK ? calculatedTimes.actualHours : '0:00',
    note: existingRecord.note ? existingRecord.note + ' ' + note : note,
    punchMethod: punchMethod,
    updatedAt: formatDateTime(now)
  });
  
  return successResponse({
    recordId: existingRecord.recordId,
    employeeId: employeeId,
    employeeName: employee.name,
    date: today,
    clockIn: existingRecord.clockIn,
    clockOut: formatTime(now),
    actualHours: calculatedTimes.actualHours,
    overtimeHours: calculatedTimes.overtimeHours
  }, '退勤打刻が完了しました');
}

/**
 * 勤怠記録を取得
 */
function getAttendanceRecord(employeeId, date) {
  const sheet = getSheet(SHEET_NAMES.ATTENDANCE);
  const data = sheet.getDataRange().getValues();
  const cols = COLUMNS.ATTENDANCE;
  const dateStr = formatDate(date);
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[cols.EMPLOYEE_ID] === employeeId && formatDate(row[cols.DATE]) === dateStr) {
      return {
        rowIndex: i + 1,
        recordId: row[cols.RECORD_ID],
        employeeId: row[cols.EMPLOYEE_ID],
        date: formatDate(row[cols.DATE]),
        clockIn: formatTime(row[cols.CLOCK_IN]),
        clockOut: formatTime(row[cols.CLOCK_OUT]),
        breakMinutes: row[cols.BREAK_MINUTES],
        workPatternId: row[cols.WORK_PATTERN_ID],
        workType: row[cols.WORK_TYPE],
        scheduledHours: row[cols.SCHEDULED_HOURS],
        actualHours: row[cols.ACTUAL_HOURS],
        overtimeHours: row[cols.OVERTIME_HOURS],
        nightHours: row[cols.NIGHT_HOURS],
        holidayHours: row[cols.HOLIDAY_HOURS],
        note: row[cols.NOTE],
        punchMethod: row[cols.PUNCH_METHOD],
        updatedAt: row[cols.UPDATED_AT]
      };
    }
  }
  return null;
}

/**
 * 勤怠記録を更新
 */
function updateAttendanceRecord(recordId, updates) {
  const sheet = getSheet(SHEET_NAMES.ATTENDANCE);
  const data = sheet.getDataRange().getValues();
  const cols = COLUMNS.ATTENDANCE;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][cols.RECORD_ID] === recordId) {
      const rowIndex = i + 1;
      
      if (updates.clockOut !== undefined) {
        sheet.getRange(rowIndex, cols.CLOCK_OUT + 1).setValue(updates.clockOut);
      }
      if (updates.actualHours !== undefined) {
        sheet.getRange(rowIndex, cols.ACTUAL_HOURS + 1).setValue(updates.actualHours);
      }
      if (updates.overtimeHours !== undefined) {
        sheet.getRange(rowIndex, cols.OVERTIME_HOURS + 1).setValue(updates.overtimeHours);
      }
      if (updates.nightHours !== undefined) {
        sheet.getRange(rowIndex, cols.NIGHT_HOURS + 1).setValue(updates.nightHours);
      }
      if (updates.holidayHours !== undefined) {
        sheet.getRange(rowIndex, cols.HOLIDAY_HOURS + 1).setValue(updates.holidayHours);
      }
      if (updates.note !== undefined) {
        sheet.getRange(rowIndex, cols.NOTE + 1).setValue(updates.note);
      }
      if (updates.punchMethod !== undefined) {
        sheet.getRange(rowIndex, cols.PUNCH_METHOD + 1).setValue(updates.punchMethod);
      }
      if (updates.updatedAt !== undefined) {
        sheet.getRange(rowIndex, cols.UPDATED_AT + 1).setValue(updates.updatedAt);
      }
      
      return true;
    }
  }
  return false;
}

/**
 * 勤務時間を計算
 */
function calculateWorkingTimes(clockIn, clockOut, breakMinutes, workPattern) {
  const clockInMinutes = timeToMinutes(clockIn);
  let clockOutMinutes = timeToMinutes(clockOut);
  
  // 日をまたぐ場合
  if (clockOutMinutes < clockInMinutes) {
    clockOutMinutes += 24 * 60;
  }
  
  // 実労働時間（分）
  const totalMinutes = clockOutMinutes - clockInMinutes - breakMinutes;
  const actualMinutes = Math.max(0, totalMinutes);
  
  // 所定労働時間（分）
  const scheduledMinutes = workPattern ? timeToMinutes(workPattern.scheduledHours) : 8 * 60;
  
  // 残業時間（分）
  let overtimeMinutes = Math.max(0, actualMinutes - scheduledMinutes);
  overtimeMinutes = roundOvertimeMinutes(overtimeMinutes);
  
  // 深夜残業時間（22:00-05:00）
  const nightStartMinutes = timeToMinutes(getSetting('NIGHT_WORK_START', '22:00'));
  const nightEndMinutes = timeToMinutes(getSetting('NIGHT_WORK_END', '05:00')) + 24 * 60;
  
  let nightMinutes = 0;
  if (clockOutMinutes > nightStartMinutes) {
    nightMinutes = Math.min(clockOutMinutes, nightEndMinutes) - Math.max(clockInMinutes, nightStartMinutes);
    nightMinutes = Math.max(0, nightMinutes);
  }
  
  return {
    actualHours: minutesToTime(actualMinutes),
    overtimeHours: minutesToTime(overtimeMinutes),
    nightHours: minutesToTime(nightMinutes)
  };
}

/**
 * 従業員の月間勤怠記録を取得
 */
function getMonthlyAttendance(employeeId, yearMonth) {
  const data = getSheetData(SHEET_NAMES.ATTENDANCE);
  const cols = COLUMNS.ATTENDANCE;
  
  return data
    .filter(row => {
      return row[cols.EMPLOYEE_ID] === employeeId && 
             getYearMonth(row[cols.DATE]) === yearMonth;
    })
    .map(row => ({
      recordId: row[cols.RECORD_ID],
      date: formatDate(row[cols.DATE]),
      clockIn: formatTime(row[cols.CLOCK_IN]),
      clockOut: formatTime(row[cols.CLOCK_OUT]),
      breakMinutes: row[cols.BREAK_MINUTES],
      workType: row[cols.WORK_TYPE],
      actualHours: row[cols.ACTUAL_HOURS],
      overtimeHours: row[cols.OVERTIME_HOURS],
      nightHours: row[cols.NIGHT_HOURS],
      holidayHours: row[cols.HOLIDAY_HOURS],
      note: row[cols.NOTE]
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

/**
 * 今日の勤怠状況を取得
 */
function getTodayAttendanceStatus(employeeId) {
  const today = formatDate(getToday());
  const record = getAttendanceRecord(employeeId, today);
  
  if (!record) {
    return { status: 'not_clocked_in', message: '未出勤' };
  }
  
  if (record.clockIn && !record.clockOut) {
    return { 
      status: 'working', 
      message: '勤務中',
      clockIn: record.clockIn
    };
  }
  
  if (record.clockIn && record.clockOut) {
    return { 
      status: 'clocked_out', 
      message: '退勤済み',
      clockIn: record.clockIn,
      clockOut: record.clockOut,
      actualHours: record.actualHours
    };
  }
  
  return { status: 'unknown', message: '不明' };
}
