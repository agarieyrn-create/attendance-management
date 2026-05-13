/**
 * 勤怠管理システム - メイン処理
 */

/**
 * Web UIを表示（メインエントリーポイント）
 */
function doGet(e) {
  var template = HtmlService.createTemplateFromFile('index');
  
  // 初期データを取得してテンプレートに渡す
  try {
    var employees = getActiveEmployees() || [];
    var workPatterns = getAllWorkPatterns() || [];
    var leaveTypes = getAllLeaveTypes() || [];
    
    template.initialEmployees = JSON.stringify(employees);
    template.initialWorkPatterns = JSON.stringify(workPatterns);
    template.initialLeaveTypes = JSON.stringify(leaveTypes);
  } catch (error) {
    console.error('初期データ取得エラー:', error);
    template.initialEmployees = '[]';
    template.initialWorkPatterns = '[]';
    template.initialLeaveTypes = '[]';
  }
  
  return template.evaluate()
    .setTitle('勤怠管理システム')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}




/**
 * POSTリクエスト処理
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    
    var result;
    
    switch (action) {
      case 'clockIn':
        result = clockIn(data.employeeId, data.punchMethod || 'Web', data.note || '');
        break;
        
      case 'clockOut':
        result = clockOut(data.employeeId, data.punchMethod || 'Web', data.note || '');
        break;
        
      case 'createLeaveRequest':
        result = createLeaveRequest(
          data.employeeId,
          data.leaveTypeId,
          data.startDate,
          data.endDate,
          data.unit,
          data.hours,
          data.reason
        );
        break;
        
      case 'approveLeaveRequest':
        result = approveLeaveRequest(data.requestId, data.approverId, data.comment || '');
        break;
        
      case 'rejectLeaveRequest':
        result = rejectLeaveRequest(data.requestId, data.approverId, data.comment || '');
        break;
        
      case 'updateAttendance':
        result = updateAttendanceManual(data);
        break;
        
      default:
        result = errorResponse('不明なアクションです', 'UNKNOWN_ACTION');
    }
    
    return createJsonResponse(result);
    
  } catch (error) {
    console.error('API Error:', error);
    return createJsonResponse(errorResponse(error.message, 'SERVER_ERROR'));
  }
}

/**
 * HTMLファイルをインクルードするためのヘルパー関数
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * ダッシュボードデータを取得
 */
function getDashboardData(employeeId) {
  try {
    var employee = getEmployeeById(employeeId);
    if (!employee) {
      return null;
    }
    
    var today = getToday();
    var yearMonth = getYearMonth(today);
    var fiscalYear = getFiscalYear(today);
    
    var todayStatus = getTodayAttendanceStatus(employeeId);
    var leaveBalance = getAllLeaveBalances(employeeId, fiscalYear);
    var overtime = getOvertimeSummary(employeeId);
    var recentAttendance = getMonthlyAttendance(employeeId, yearMonth);
    
    var pendingRequests = [];
    if (employee.role === 'admin' || employee.role === 'manager') {
      pendingRequests = getPendingLeaveRequests(employeeId);
    }
    
    return {
      employee: {
        id: employee.id,
        name: employee.name,
        department: employee.department,
        position: employee.position,
        role: employee.role
      },
      today: {
        date: formatDate(today),
        status: todayStatus,
        isWorkingDay: isWorkingDay(today)
      },
      leaveBalance: leaveBalance,
      overtime: overtime,
      pendingRequests: pendingRequests,
      recentAttendance: recentAttendance ? recentAttendance.slice(-5) : []
    };
  } catch (error) {
    console.error('getDashboardData error:', error);
    return null;
  }
}

/**
 * 勤怠記録を手動更新
 */
function updateAttendanceManual(data) {
  try {
    var employee = getEmployeeById(data.employeeId);
    if (!employee) {
      return errorResponse('従業員が見つかりません', 'EMPLOYEE_NOT_FOUND');
    }
    
    if (data.updatedBy !== data.employeeId && !hasPermission(data.updatedBy, 'admin')) {
      return errorResponse('更新権限がありません', 'NO_PERMISSION');
    }
    
    var existingRecord = getAttendanceRecord(data.employeeId, data.date);
    
    if (existingRecord) {
      var workPattern = getWorkPattern(employee.workPatternId);
      var calculatedTimes = calculateWorkingTimes(
        data.clockIn,
        data.clockOut,
        data.breakMinutes || existingRecord.breakMinutes,
        workPattern
      );
      
      updateAttendanceRecord(existingRecord.recordId, {
        clockOut: data.clockOut,
        actualHours: calculatedTimes.actualHours,
        overtimeHours: calculatedTimes.overtimeHours,
        nightHours: calculatedTimes.nightHours,
        note: data.note || existingRecord.note,
        punchMethod: '手動',
        updatedAt: formatDateTime(getNow())
      });
      
      return successResponse({ recordId: existingRecord.recordId }, '勤怠記録を更新しました');
    } else {
      var workPattern = getWorkPattern(employee.workPatternId);
      var breakMins = data.breakMinutes || (workPattern ? workPattern.breakMinutes : 60);
      var calculatedTimes = calculateWorkingTimes(
        data.clockIn,
        data.clockOut,
        breakMins,
        workPattern
      );
      
      var recordId = generateId('ATT');
      var workType = isWorkingDay(new Date(data.date)) ? WORK_TYPES.NORMAL : WORK_TYPES.HOLIDAY_WORK;
      
      var rowData = [
        recordId,
        data.employeeId,
        formatDate(data.date),
        data.clockIn,
        data.clockOut,
        breakMins,
        employee.workPatternId,
        workType,
        workPattern ? workPattern.scheduledHours : '8:00',
        calculatedTimes.actualHours,
        calculatedTimes.overtimeHours,
        calculatedTimes.nightHours,
        workType === WORK_TYPES.HOLIDAY_WORK ? calculatedTimes.actualHours : '0:00',
        data.note || '',
        '手動',
        formatDateTime(getNow())
      ];
      
      appendToSheet(SHEET_NAMES.ATTENDANCE, rowData);
      
      return successResponse({ recordId: recordId }, '勤怠記録を作成しました');
    }
  } catch (error) {
    console.error('updateAttendanceManual error:', error);
    return errorResponse(error.message, 'ERROR');
  }
}

/**
 * 初期セットアップ
 */
function initialSetup() {
  setupTriggers();
  setupDocumentSheet();
  console.log('初期セットアップが完了しました');
}

/**
 * トリガーを設定
 */
function setupTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  
  ScriptApp.newTrigger('dailyCheck36Agreement')
    .timeBased()
    .atHour(9)
    .everyDays(1)
    .create();
  
  ScriptApp.newTrigger('monthlyAggregation')
    .timeBased()
    .onMonthDay(1)
    .atHour(1)
    .create();
  
  ScriptApp.newTrigger('dailyLeaveGrantCheck')
    .timeBased()
    .atHour(0)
    .everyDays(1)
    .create();
  
  console.log('トリガーを設定しました');
}

/**
 * 毎日の36協定チェック
 */
function dailyCheck36Agreement() {
  var yearMonth = getYearMonth(getToday());
  var results = checkAll36Agreements(yearMonth);
  
  for (var i = 0; i < results.length; i++) {
    var result = results[i];
    if (result.status !== STATUS.AGREEMENT_36.NORMAL) {
      var fullCheck = check36Agreement(result.employeeId, yearMonth);
      send36AgreementWarningEmail(result.employeeId, fullCheck);
    }
  }
  
  console.log('36協定チェック完了: ' + results.length + '名');
}

/**
 * 月次集計処理
 */
function monthlyAggregation() {
  var today = getToday();
  var lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  var yearMonth = getYearMonth(lastMonth);
  
  var employees = getActiveEmployees();
  var sheet = getSheet(SHEET_NAMES.MONTHLY_SUMMARY);
  
  for (var i = 0; i < employees.length; i++) {
    var employee = employees[i];
    var attendance = getMonthlyAttendance(employee.id, yearMonth);
    var overtime = calculateMonthlyOvertime(employee.id, yearMonth);
    var fiscalYear = getFiscalYear(lastMonth);
    var yearlyOvertime = calculateYearlyOvertime(employee.id, fiscalYear);
    var check = check36Agreement(employee.id, yearMonth);
    
    var workDays = 0;
    var scheduledMinutes = 0;
    var actualMinutes = 0;
    var lateCount = 0;
    var earlyLeaveCount = 0;
    var paidLeaveDays = 0;
    var absentDays = 0;
    
    var workPattern = getWorkPattern(employee.workPatternId);
    var lateThreshold = parseInt(getSetting('LATE_THRESHOLD', '5'), 10);
    
    if (attendance && attendance.length > 0) {
      for (var j = 0; j < attendance.length; j++) {
        var record = attendance[j];
        if (record.workType === WORK_TYPES.NORMAL || record.workType === WORK_TYPES.HOLIDAY_WORK) {
          workDays++;
          scheduledMinutes += timeToMinutes(record.scheduledHours || '8:00');
          actualMinutes += timeToMinutes(record.actualHours);
          
          if (workPattern && record.clockIn) {
            var scheduledStart = timeToMinutes(workPattern.startTime);
            var actualStart = timeToMinutes(record.clockIn);
            if (actualStart > scheduledStart + lateThreshold) {
              lateCount++;
            }
          }
        }
      }
    }
    
    var leaveRequests = getEmployeeLeaveRequests(employee.id, STATUS.LEAVE_REQUEST.APPROVED);
    if (leaveRequests && leaveRequests.length > 0) {
      for (var k = 0; k < leaveRequests.length; k++) {
        var request = leaveRequests[k];
        if (getYearMonth(request.startDate) === yearMonth) {
          if (request.leaveTypeId === 'LEAVE001') {
            paidLeaveDays += request.daysTaken;
          } else if (request.leaveTypeId === 'LEAVE010') {
            absentDays += request.daysTaken;
          }
        }
      }
    }
    
    var rowData = [
      employee.id,
      yearMonth,
      workDays,
      minutesToTime(scheduledMinutes),
      minutesToTime(actualMinutes),
      overtime.totalHours,
      overtime.nightHours,
      overtime.holidayHours,
      paidLeaveDays,
      absentDays,
      lateCount,
      earlyLeaveCount,
      check.status,
      yearlyOvertime.totalHours,
      formatDateTime(getNow())
    ];
    
    sheet.appendRow(rowData);
  }
  
  console.log('月次集計完了: ' + yearMonth + ', ' + employees.length + '名');
}

/**
 * 有給休暇自動付与チェック
 */
function dailyLeaveGrantCheck() {
  var today = getToday();
  var employees = getActiveEmployees();
  
  for (var i = 0; i < employees.length; i++) {
    var employee = employees[i];
    if (!employee.hireDate) continue;
    
    var hireDate = new Date(employee.hireDate);
    var todayMonth = today.getMonth();
    var todayDate = today.getDate();
    var hireMonth = hireDate.getMonth();
    var hireDateDay = hireDate.getDate();
    
    if (todayMonth === hireMonth && todayDate === hireDateDay) {
      var yearsOfService = calculateYearsOfService(employee.id, today);
      
      if (yearsOfService >= 0.5) {
        var grantDays = calculateLegalPaidLeaveDays(yearsOfService);
        grantPaidLeave(employee.id, grantDays);
        console.log('有給付与: ' + employee.name + ', ' + grantDays + '日');
      }
    }
  }
}

/**
 * 有給休暇を付与
 */
function grantPaidLeave(employeeId, days) {
  var fiscalYear = getFiscalYear(getToday());
  var sheet = getSheet(SHEET_NAMES.LEAVE_BALANCE);
  
  var currentBalance = getLeaveBalance(employeeId, 'LEAVE001', fiscalYear);
  
  if (currentBalance) {
    var leaveType = getLeaveType('LEAVE001');
    var maxCarryOver = leaveType ? leaveType.maxCarryOver : 20;
    var carryOver = Math.min(currentBalance.remaining, maxCarryOver);
    
    var newFiscalYear = fiscalYear + 1;
    var rowData = [
      employeeId,
      'LEAVE001',
      newFiscalYear,
      carryOver,
      days,
      0,
      carryOver + days,
      formatDate(getToday())
    ];
    
    sheet.appendRow(rowData);
  } else {
    var rowData = [
      employeeId,
      'LEAVE001',
      fiscalYear,
      0,
      days,
      0,
      days,
      formatDate(getToday())
    ];
    
    sheet.appendRow(rowData);
  }
}

/**
 * テスト用：出勤打刻
 */
function testClockIn() {
  var result = clockIn('EMP001', 'Web', 'テスト打刻');
  console.log(JSON.stringify(result, null, 2));
}

/**
 * テスト用：退勤打刻
 */
function testClockOut() {
  var result = clockOut('EMP001', 'Web', '');
  console.log(JSON.stringify(result, null, 2));
}

/**
 * テスト用：ダッシュボードデータ取得
 */
function testGetDashboard() {
  var result = getDashboardData('EMP001');
  console.log(JSON.stringify(result, null, 2));
}

/**
 * テスト用：36協定チェック
 */
function testCheck36Agreement() {
  var result = check36Agreement('EMP003');
  console.log(JSON.stringify(result, null, 2));
}

/**
 * テスト用：従業員取得
 */
function testGetEmployees() {
  var result = getActiveEmployees();
  console.log('従業員数: ' + result.length);
  if (result.length > 0) {
    console.log('最初の従業員: ' + JSON.stringify(result[0]));
  }
}
function testWebCall() {
  console.log('=== Webからの呼び出しをシミュレート ===');
  
  // 1. SPREADSHEET_ID確認
  console.log('SPREADSHEET_ID: ' + SPREADSHEET_ID);
  
  // 2. getSpreadsheet確認
  try {
    var ss = getSpreadsheet();
    console.log('getSpreadsheet: ' + (ss ? ss.getName() : 'null'));
  } catch(e) {
    console.log('getSpreadsheet エラー: ' + e.message);
  }
  
  // 3. SHEET_NAMES確認
  console.log('SHEET_NAMES.EMPLOYEES: ' + SHEET_NAMES.EMPLOYEES);
  
  // 4. getActiveEmployees確認
  try {
    var emps = getActiveEmployees();
    console.log('getActiveEmployees: ' + (emps ? emps.length + '名' : 'null'));
    return emps;
  } catch(e) {
    console.log('getActiveEmployees エラー: ' + e.message);
    return null;
  }
}
function testHtmlOutput() {
  try {
    var template = HtmlService.createTemplateFromFile('index');
    var html = template.evaluate().getContent();
    
    console.log('HTML長さ: ' + html.length + '文字');
    console.log('最初の500文字:');
    console.log(html.substring(0, 500));
    
    // google.script.runが含まれているか確認
    if (html.indexOf('google.script.run') > -1) {
      console.log('google.script.run: 含まれている');
    } else {
      console.log('google.script.run: 含まれていない ← 問題！');
    }
    
    // CSSが展開されているか確認
    if (html.indexOf('<style>') > -1) {
      console.log('CSS: 展開されている');
    } else {
      console.log('CSS: 展開されていない ← 問題！');
    }
    
  } catch (e) {
    console.log('エラー: ' + e.message);
  }
}
function testSimpleHtml() {
  var html = '<!DOCTYPE html><html><head></head><body>' +
    '<h1>テスト</h1>' +
    '<button onclick="testRun()">テスト実行</button>' +
    '<div id="result"></div>' +
    '<script>' +
    'function testRun() {' +
    '  document.getElementById("result").innerText = "実行中...";' +
    '  google.script.run' +
    '    .withSuccessHandler(function(r) {' +
    '      document.getElementById("result").innerText = "成功: " + r.length + "名";' +
    '    })' +
    '    .withFailureHandler(function(e) {' +
    '      document.getElementById("result").innerText = "失敗: " + e.message;' +
    '    })' +
    '    .testGetEmployeesForWeb();' +
    '}' +
    '<\/script>' +
    '</body></html>';
  
  return HtmlService.createHtmlOutput(html)
    .setTitle('テスト')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function testGetEmployeesForWeb() {
  var employees = getActiveEmployees();
  return employees;
}
function testGetEmployeesForWebDirect() {
  try {
    var result = testGetEmployeesForWeb();
    console.log('結果:', result);
    console.log('件数:', result ? result.length : 'null');
  } catch (e) {
    console.log('エラー:', e.message);
  }
}