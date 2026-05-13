/**
 * 勤怠管理システム - 休暇サービス
 */

/**
 * 休暇申請を作成
 */
function createLeaveRequest(employeeId, leaveTypeId, startDate, endDate, unit, hours, reason) {
  const employee = getEmployeeById(employeeId);
  if (!employee) {
    return errorResponse('従業員が見つかりません', 'EMPLOYEE_NOT_FOUND');
  }
  
  const leaveType = getLeaveType(leaveTypeId);
  if (!leaveType) {
    return errorResponse('休暇種類が見つかりません', 'LEAVE_TYPE_NOT_FOUND');
  }
  
  // 残日数チェック
  const balance = getLeaveBalance(employeeId, leaveTypeId, getFiscalYear(new Date()));
  const daysTaken = calculateDaysTaken(startDate, endDate, unit, hours);
  
  if (balance && balance.remaining < daysTaken) {
    return errorResponse(`休暇残数が不足しています（残: ${balance.remaining}日, 申請: ${daysTaken}日）`, 'INSUFFICIENT_BALANCE');
  }
  
  const now = getNow();
  const requestId = generateId('REQ');
  
  const rowData = [
    requestId,                    // 申請ID
    employeeId,                   // 社員ID
    leaveTypeId,                  // 休暇種類ID
    formatDate(startDate),        // 開始日
    formatDate(endDate),          // 終了日
    unit,                         // 取得単位
    hours || '',                  // 時間数
    formatDateTime(now),          // 申請日時
    reason,                       // 申請理由
    STATUS.LEAVE_REQUEST.PENDING, // ステータス
    '',                           // 承認者ID
    '',                           // 承認日時
    '',                           // 承認コメント
    daysTaken                     // 取得日数
  ];
  
  appendToSheet(SHEET_NAMES.LEAVE_REQUESTS, rowData);
  
  // 上長に通知メール送信（オプション）
  if (employee.managerId) {
    sendLeaveRequestNotification(requestId, employee, leaveType);
  }
  
  return successResponse({
    requestId: requestId,
    employeeId: employeeId,
    leaveType: leaveType.name,
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    daysTaken: daysTaken,
    status: STATUS.LEAVE_REQUEST.PENDING
  }, '休暇申請が完了しました');
}

/**
 * 休暇申請を承認
 */
function approveLeaveRequest(requestId, approverId, comment = '') {
  const request = getLeaveRequest(requestId);
  if (!request) {
    return errorResponse('申請が見つかりません', 'REQUEST_NOT_FOUND');
  }
  
  if (request.status !== STATUS.LEAVE_REQUEST.PENDING) {
    return errorResponse('この申請は既に処理済みです', 'ALREADY_PROCESSED');
  }
  
  // 承認権限チェック
  if (!canApprove(approverId, request.employeeId)) {
    return errorResponse('承認権限がありません', 'NO_PERMISSION');
  }
  
  const now = getNow();
  
  // 申請を更新
  updateLeaveRequest(requestId, {
    status: STATUS.LEAVE_REQUEST.APPROVED,
    approverId: approverId,
    approvedAt: formatDateTime(now),
    comment: comment
  });
  
  // 休暇残数を更新
  updateLeaveBalance(
    request.employeeId, 
    request.leaveTypeId, 
    getFiscalYear(new Date(request.startDate)),
    request.daysTaken
  );
  
  return successResponse({
    requestId: requestId,
    status: STATUS.LEAVE_REQUEST.APPROVED
  }, '休暇申請を承認しました');
}

/**
 * 休暇申請を却下
 */
function rejectLeaveRequest(requestId, approverId, comment = '') {
  const request = getLeaveRequest(requestId);
  if (!request) {
    return errorResponse('申請が見つかりません', 'REQUEST_NOT_FOUND');
  }
  
  if (request.status !== STATUS.LEAVE_REQUEST.PENDING) {
    return errorResponse('この申請は既に処理済みです', 'ALREADY_PROCESSED');
  }
  
  if (!canApprove(approverId, request.employeeId)) {
    return errorResponse('承認権限がありません', 'NO_PERMISSION');
  }
  
  const now = getNow();
  
  updateLeaveRequest(requestId, {
    status: STATUS.LEAVE_REQUEST.REJECTED,
    approverId: approverId,
    approvedAt: formatDateTime(now),
    comment: comment
  });
  
  return successResponse({
    requestId: requestId,
    status: STATUS.LEAVE_REQUEST.REJECTED
  }, '休暇申請を却下しました');
}

/**
 * 休暇種類を取得
 */
function getLeaveType(leaveTypeId) {
  const data = getSheetData(SHEET_NAMES.LEAVE_TYPES);
  
  for (const row of data) {
    if (row[0] === leaveTypeId) {
      return {
        id: row[0],
        name: row[1],
        isPaid: row[2] === '有給',
        annualDays: row[3],
        canCarryOver: row[4] === '可',
        maxCarryOver: row[5],
        allowHalfDay: row[6] === '可',
        allowHourly: row[7] === '可',
        advanceNotice: row[8],
        note: row[9]
      };
    }
  }
  return null;
}

/**
 * 全休暇種類を取得
 */
function getAllLeaveTypes() {
  const data = getSheetData(SHEET_NAMES.LEAVE_TYPES);
  
  return data.map(row => ({
    id: row[0],
    name: row[1],
    isPaid: row[2] === '有給',
    annualDays: row[3],
    canCarryOver: row[4] === '可',
    maxCarryOver: row[5],
    allowHalfDay: row[6] === '可',
    allowHourly: row[7] === '可',
    advanceNotice: row[8],
    note: row[9]
  }));
}

/**
 * 休暇申請を取得
 */
function getLeaveRequest(requestId) {
  const sheet = getSheet(SHEET_NAMES.LEAVE_REQUESTS);
  const data = sheet.getDataRange().getValues();
  const cols = COLUMNS.LEAVE_REQUESTS;
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[cols.REQUEST_ID] === requestId) {
      return {
        rowIndex: i + 1,
        requestId: row[cols.REQUEST_ID],
        employeeId: row[cols.EMPLOYEE_ID],
        leaveTypeId: row[cols.LEAVE_TYPE_ID],
        startDate: formatDate(row[cols.START_DATE]),
        endDate: formatDate(row[cols.END_DATE]),
        unit: row[cols.UNIT],
        hours: row[cols.HOURS],
        requestedAt: row[cols.REQUESTED_AT],
        reason: row[cols.REASON],
        status: row[cols.STATUS],
        approverId: row[cols.APPROVER_ID],
        approvedAt: row[cols.APPROVED_AT],
        comment: row[cols.APPROVER_COMMENT],
        daysTaken: row[cols.DAYS_TAKEN]
      };
    }
  }
  return null;
}

/**
 * 休暇申請を更新
 */
function updateLeaveRequest(requestId, updates) {
  const sheet = getSheet(SHEET_NAMES.LEAVE_REQUESTS);
  const data = sheet.getDataRange().getValues();
  const cols = COLUMNS.LEAVE_REQUESTS;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][cols.REQUEST_ID] === requestId) {
      const rowIndex = i + 1;
      
      if (updates.status !== undefined) {
        sheet.getRange(rowIndex, cols.STATUS + 1).setValue(updates.status);
      }
      if (updates.approverId !== undefined) {
        sheet.getRange(rowIndex, cols.APPROVER_ID + 1).setValue(updates.approverId);
      }
      if (updates.approvedAt !== undefined) {
        sheet.getRange(rowIndex, cols.APPROVED_AT + 1).setValue(updates.approvedAt);
      }
      if (updates.comment !== undefined) {
        sheet.getRange(rowIndex, cols.APPROVER_COMMENT + 1).setValue(updates.comment);
      }
      
      return true;
    }
  }
  return false;
}

/**
 * 休暇残数を取得
 */
function getLeaveBalance(employeeId, leaveTypeId, year) {
  const data = getSheetData(SHEET_NAMES.LEAVE_BALANCE);
  const cols = COLUMNS.LEAVE_BALANCE;
  
  for (const row of data) {
    if (row[cols.EMPLOYEE_ID] === employeeId && 
        row[cols.LEAVE_TYPE_ID] === leaveTypeId && 
        row[cols.YEAR] == year) {
      return {
        employeeId: row[cols.EMPLOYEE_ID],
        leaveTypeId: row[cols.LEAVE_TYPE_ID],
        year: row[cols.YEAR],
        carriedOver: row[cols.CARRIED_OVER],
        granted: row[cols.GRANTED],
        used: row[cols.USED],
        remaining: row[cols.REMAINING]
      };
    }
  }
  return null;
}

/**
 * 従業員の全休暇残数を取得
 */
function getAllLeaveBalances(employeeId, year) {
  const data = getSheetData(SHEET_NAMES.LEAVE_BALANCE);
  const cols = COLUMNS.LEAVE_BALANCE;
  
  return data
    .filter(row => row[cols.EMPLOYEE_ID] === employeeId && row[cols.YEAR] == year)
    .map(row => {
      const leaveType = getLeaveType(row[cols.LEAVE_TYPE_ID]);
      return {
        leaveTypeId: row[cols.LEAVE_TYPE_ID],
        leaveTypeName: leaveType ? leaveType.name : row[cols.LEAVE_TYPE_ID],
        carriedOver: row[cols.CARRIED_OVER],
        granted: row[cols.GRANTED],
        used: row[cols.USED],
        remaining: row[cols.REMAINING]
      };
    });
}

/**
 * 休暇残数を更新
 */
function updateLeaveBalance(employeeId, leaveTypeId, year, daysUsed) {
  const sheet = getSheet(SHEET_NAMES.LEAVE_BALANCE);
  const data = sheet.getDataRange().getValues();
  const cols = COLUMNS.LEAVE_BALANCE;
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[cols.EMPLOYEE_ID] === employeeId && 
        row[cols.LEAVE_TYPE_ID] === leaveTypeId && 
        row[cols.YEAR] == year) {
      
      const rowIndex = i + 1;
      const newUsed = row[cols.USED] + daysUsed;
      const newRemaining = row[cols.CARRIED_OVER] + row[cols.GRANTED] - newUsed;
      
      sheet.getRange(rowIndex, cols.USED + 1).setValue(newUsed);
      sheet.getRange(rowIndex, cols.REMAINING + 1).setValue(newRemaining);
      sheet.getRange(rowIndex, cols.UPDATED_AT + 1).setValue(formatDate(getNow()));
      
      return true;
    }
  }
  return false;
}

/**
 * 取得日数を計算
 */
function calculateDaysTaken(startDate, endDate, unit, hours) {
  if (unit === LEAVE_UNITS.FULL_DAY) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    let days = 0;
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (isWorkingDay(d)) {
        days++;
      }
    }
    return days;
  }
  
  if (unit === LEAVE_UNITS.AM || unit === LEAVE_UNITS.PM) {
    return 0.5;
  }
  
  if (unit === LEAVE_UNITS.HOURLY && hours) {
    return hours / 8; // 8時間 = 1日として計算
  }
  
  return 1;
}

/**
 * 従業員の休暇申請一覧を取得
 */
function getEmployeeLeaveRequests(employeeId, status = null) {
  const data = getSheetData(SHEET_NAMES.LEAVE_REQUESTS);
  const cols = COLUMNS.LEAVE_REQUESTS;
  
  return data
    .filter(row => {
      const matchEmployee = row[cols.EMPLOYEE_ID] === employeeId;
      const matchStatus = status ? row[cols.STATUS] === status : true;
      return matchEmployee && matchStatus;
    })
    .map(row => {
      const leaveType = getLeaveType(row[cols.LEAVE_TYPE_ID]);
      return {
        requestId: row[cols.REQUEST_ID],
        leaveTypeId: row[cols.LEAVE_TYPE_ID],
        leaveTypeName: leaveType ? leaveType.name : row[cols.LEAVE_TYPE_ID],
        startDate: formatDate(row[cols.START_DATE]),
        endDate: formatDate(row[cols.END_DATE]),
        unit: row[cols.UNIT],
        hours: row[cols.HOURS],
        requestedAt: row[cols.REQUESTED_AT],
        reason: row[cols.REASON],
        status: row[cols.STATUS],
        daysTaken: row[cols.DAYS_TAKEN]
      };
    })
    .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
}

/**
 * 承認待ち申請を取得（管理者・上長用）
 */
function getPendingLeaveRequests(approverId) {
  const data = getSheetData(SHEET_NAMES.LEAVE_REQUESTS);
  const cols = COLUMNS.LEAVE_REQUESTS;
  const isAdmin = hasPermission(approverId, 'admin');
  
  return data
    .filter(row => {
      if (row[cols.STATUS] !== STATUS.LEAVE_REQUEST.PENDING) return false;
      if (isAdmin) return true;
      
      // 上長の場合、自分の部下の申請のみ
      const applicant = getEmployeeById(row[cols.EMPLOYEE_ID]);
      return applicant && applicant.managerId === approverId;
    })
    .map(row => {
      const employee = getEmployeeById(row[cols.EMPLOYEE_ID]);
      const leaveType = getLeaveType(row[cols.LEAVE_TYPE_ID]);
      return {
        requestId: row[cols.REQUEST_ID],
        employeeId: row[cols.EMPLOYEE_ID],
        employeeName: employee ? employee.name : row[cols.EMPLOYEE_ID],
        department: employee ? employee.department : '',
        leaveTypeName: leaveType ? leaveType.name : row[cols.LEAVE_TYPE_ID],
        startDate: formatDate(row[cols.START_DATE]),
        endDate: formatDate(row[cols.END_DATE]),
        unit: row[cols.UNIT],
        requestedAt: row[cols.REQUESTED_AT],
        reason: row[cols.REASON],
        daysTaken: row[cols.DAYS_TAKEN]
      };
    })
    .sort((a, b) => new Date(a.requestedAt) - new Date(b.requestedAt));
}

/**
 * 休暇申請通知メール送信
 */
function sendLeaveRequestNotification(requestId, employee, leaveType) {
  const manager = getEmployeeById(employee.managerId);
  if (!manager || !manager.email) return;
  
  const request = getLeaveRequest(requestId);
  if (!request) return;
  
  const subject = `【休暇申請】${employee.name}さんから休暇申請があります`;
  const body = `
${manager.name}様

${employee.name}さんから以下の休暇申請がありました。

■申請内容
・休暇種類: ${leaveType.name}
・期間: ${request.startDate} ～ ${request.endDate}
・取得単位: ${request.unit}
・日数: ${request.daysTaken}日
・理由: ${request.reason}

勤怠管理システムにログインして承認処理をお願いします。
  `.trim();
  
  try {
    MailApp.sendEmail(manager.email, subject, body);
  } catch (e) {
    console.error('メール送信エラー:', e);
  }
}
