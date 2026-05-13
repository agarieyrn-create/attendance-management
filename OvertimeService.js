/**
 * 勤怠管理システム - 残業・36協定サービス
 */

/**
 * 36協定設定を取得
 */
function get36Agreement(employeeId) {
  const employee = getEmployeeById(employeeId);
  if (!employee) return null;
  
  const data = getSheetData(SHEET_NAMES.AGREEMENT_36);
  
  // 部署別の設定を優先
  for (const row of data) {
    if (row[8] === employee.department) {
      return rowTo36Agreement(row);
    }
  }
  
  // 管理監督者チェック
  if (employee.role === 'admin' || employee.position === '部長') {
    for (const row of data) {
      if (row[1] === '管理監督者') {
        return rowTo36Agreement(row);
      }
    }
  }
  
  // デフォルト（一般従業員）
  for (const row of data) {
    if (row[0] === '36AGR001') {
      return rowTo36Agreement(row);
    }
  }
  
  return null;
}

/**
 * 行データを36協定オブジェクトに変換
 */
function rowTo36Agreement(row) {
  return {
    id: row[0],
    name: row[1],
    monthlyLimit: row[2],
    yearlyLimit: row[3],
    specialMonthlyLimit: row[4],
    specialYearlyLimit: row[5],
    specialMonthCount: row[6],
    warningThreshold: row[7],
    department: row[8],
    note: row[9]
  };
}

/**
 * 月間残業時間を計算
 */
function calculateMonthlyOvertime(employeeId, yearMonth) {
  const attendance = getMonthlyAttendance(employeeId, yearMonth);
  
  let totalMinutes = 0;
  let nightMinutes = 0;
  let holidayMinutes = 0;
  
  for (const record of attendance) {
    totalMinutes += timeToMinutes(record.overtimeHours);
    nightMinutes += timeToMinutes(record.nightHours);
    holidayMinutes += timeToMinutes(record.holidayHours);
  }
  
  return {
    totalHours: minutesToTime(totalMinutes),
    totalMinutes: totalMinutes,
    nightHours: minutesToTime(nightMinutes),
    holidayHours: minutesToTime(holidayMinutes)
  };
}

/**
 * 年間残業時間を計算
 */
function calculateYearlyOvertime(employeeId, fiscalYear) {
  const fiscalYearStart = parseInt(getSetting('FISCAL_YEAR_START', '04'), 10);
  
  let totalMinutes = 0;
  let specialMonthCount = 0;
  
  // 年度の各月をループ
  for (let i = 0; i < 12; i++) {
    const month = ((fiscalYearStart - 1 + i) % 12) + 1;
    const year = i < (13 - fiscalYearStart) ? fiscalYear : fiscalYear + 1;
    const yearMonth = `${year}/${String(month).padStart(2, '0')}`;
    
    const monthly = calculateMonthlyOvertime(employeeId, yearMonth);
    totalMinutes += monthly.totalMinutes;
    
    // 45時間超の月をカウント
    if (monthly.totalMinutes > 45 * 60) {
      specialMonthCount++;
    }
  }
  
  return {
    totalHours: minutesToTime(totalMinutes),
    totalMinutes: totalMinutes,
    specialMonthCount: specialMonthCount
  };
}

/**
 * 36協定チェック
 */
function check36Agreement(employeeId, yearMonth = null) {
  if (!yearMonth) {
    yearMonth = getYearMonth(getToday());
  }
  
  const agreement = get36Agreement(employeeId);
  if (!agreement || agreement.monthlyLimit === 0) {
    // 管理監督者等、規制対象外
    return {
      status: STATUS.AGREEMENT_36.NORMAL,
      message: '労働時間規制対象外',
      isExempt: true
    };
  }
  
  const monthly = calculateMonthlyOvertime(employeeId, yearMonth);
  const fiscalYear = getFiscalYear(new Date(yearMonth + '/01'));
  const yearly = calculateYearlyOvertime(employeeId, fiscalYear);
  
  const monthlyHours = monthly.totalMinutes / 60;
  const yearlyHours = yearly.totalMinutes / 60;
  
  const result = {
    employeeId: employeeId,
    yearMonth: yearMonth,
    monthlyOvertime: monthly.totalHours,
    monthlyOvertimeHours: monthlyHours,
    yearlyOvertime: yearly.totalHours,
    yearlyOvertimeHours: yearlyHours,
    specialMonthCount: yearly.specialMonthCount,
    agreement: agreement,
    warnings: [],
    status: STATUS.AGREEMENT_36.NORMAL
  };
  
  // 月間チェック
  const monthlyWarningThreshold = agreement.monthlyLimit * (agreement.warningThreshold / 100);
  
  if (monthlyHours >= agreement.specialMonthlyLimit) {
    result.status = STATUS.AGREEMENT_36.EXCEEDED;
    result.warnings.push(`月間残業時間が特別条項上限（${agreement.specialMonthlyLimit}時間）を超過しています`);
  } else if (monthlyHours >= agreement.monthlyLimit) {
    result.status = STATUS.AGREEMENT_36.WARNING;
    result.warnings.push(`月間残業時間が通常上限（${agreement.monthlyLimit}時間）を超過しています`);
  } else if (monthlyHours >= monthlyWarningThreshold) {
    result.status = STATUS.AGREEMENT_36.WARNING;
    result.warnings.push(`月間残業時間が警告閾値（${monthlyWarningThreshold}時間）を超えています`);
  }
  
  // 年間チェック
  const yearlyWarningThreshold = agreement.yearlyLimit * (agreement.warningThreshold / 100);
  
  if (yearlyHours >= agreement.specialYearlyLimit) {
    result.status = STATUS.AGREEMENT_36.EXCEEDED;
    result.warnings.push(`年間残業時間が特別条項上限（${agreement.specialYearlyLimit}時間）を超過しています`);
  } else if (yearlyHours >= agreement.yearlyLimit) {
    if (result.status !== STATUS.AGREEMENT_36.EXCEEDED) {
      result.status = STATUS.AGREEMENT_36.WARNING;
    }
    result.warnings.push(`年間残業時間が通常上限（${agreement.yearlyLimit}時間）を超過しています`);
  } else if (yearlyHours >= yearlyWarningThreshold) {
    if (result.status === STATUS.AGREEMENT_36.NORMAL) {
      result.status = STATUS.AGREEMENT_36.WARNING;
    }
    result.warnings.push(`年間残業時間が警告閾値（${yearlyWarningThreshold}時間）を超えています`);
  }
  
  // 特別条項適用回数チェック
  if (yearly.specialMonthCount >= agreement.specialMonthCount) {
    result.status = STATUS.AGREEMENT_36.EXCEEDED;
    result.warnings.push(`特別条項適用月数（${yearly.specialMonthCount}回）が上限（${agreement.specialMonthCount}回）に達しています`);
  }
  
  return result;
}

/**
 * 全従業員の36協定チェック
 */
function checkAll36Agreements(yearMonth = null) {
  const employees = getActiveEmployees();
  const results = [];
  
  for (const employee of employees) {
    const check = check36Agreement(employee.id, yearMonth);
    if (!check.isExempt) {
      results.push({
        employeeId: employee.id,
        employeeName: employee.name,
        department: employee.department,
        status: check.status,
        monthlyOvertime: check.monthlyOvertime,
        yearlyOvertime: check.yearlyOvertime,
        warnings: check.warnings
      });
    }
  }
  
  return results;
}

/**
 * 36協定警告メール送信
 */
function send36AgreementWarningEmail(employeeId, checkResult) {
  const employee = getEmployeeById(employeeId);
  if (!employee) return;
  
  const recipients = [];
  
  // 本人
  if (employee.email) {
    recipients.push(employee.email);
  }
  
  // 上長
  if (employee.managerId) {
    const manager = getEmployeeById(employee.managerId);
    if (manager && manager.email) {
      recipients.push(manager.email);
    }
  }
  
  // 管理者
  const adminEmail = getSetting('NOTIFICATION_EMAIL');
  if (adminEmail) {
    recipients.push(adminEmail);
  }
  
  if (recipients.length === 0) return;
  
  const statusLabel = checkResult.status === STATUS.AGREEMENT_36.EXCEEDED ? '【超過】' : '【警告】';
  const subject = `${statusLabel} 36協定 残業時間アラート - ${employee.name}`;
  
  const body = `
${employee.name}さんの残業時間について、36協定に関するアラートが発生しました。

■現在の状況
・ステータス: ${checkResult.status}
・月間残業時間: ${checkResult.monthlyOvertime}
・年間残業時間: ${checkResult.yearlyOvertime}
・特別条項適用月数: ${checkResult.specialMonthCount}回

■警告内容
${checkResult.warnings.map(w => '・' + w).join('\n')}

■36協定上限
・月間上限: ${checkResult.agreement.monthlyLimit}時間
・年間上限: ${checkResult.agreement.yearlyLimit}時間
・特別条項月間上限: ${checkResult.agreement.specialMonthlyLimit}時間
・特別条項年間上限: ${checkResult.agreement.specialYearlyLimit}時間

早急に対応をお願いします。
  `.trim();
  
  try {
    MailApp.sendEmail(recipients.join(','), subject, body);
  } catch (e) {
    console.error('メール送信エラー:', e);
  }
}

/**
 * 残業時間サマリーを取得（ダッシュボード用）
 */
function getOvertimeSummary(employeeId) {
  const today = getToday();
  const yearMonth = getYearMonth(today);
  const fiscalYear = getFiscalYear(today);
  
  const monthly = calculateMonthlyOvertime(employeeId, yearMonth);
  const yearly = calculateYearlyOvertime(employeeId, fiscalYear);
  const agreement = get36Agreement(employeeId);
  const check = check36Agreement(employeeId, yearMonth);
  
  return {
    yearMonth: yearMonth,
    fiscalYear: fiscalYear,
    monthly: {
      overtime: monthly.totalHours,
      nightWork: monthly.nightHours,
      holidayWork: monthly.holidayHours,
      limit: agreement ? agreement.monthlyLimit : null,
      percentage: agreement ? Math.round((monthly.totalMinutes / 60 / agreement.monthlyLimit) * 100) : null
    },
    yearly: {
      overtime: yearly.totalHours,
      limit: agreement ? agreement.yearlyLimit : null,
      percentage: agreement ? Math.round((yearly.totalMinutes / 60 / agreement.yearlyLimit) * 100) : null,
      specialMonthCount: yearly.specialMonthCount
    },
    status: check.status,
    warnings: check.warnings
  };
}
