/**
 * ドキュメント管理サービス
 * 規程・マニュアルのデータをスプレッドシート＆Googleドキュメントで管理
 */

/**
 * 全ドキュメントのメタデータを取得
 */
function getAllDocuments() {
  var sheet = getSpreadsheet().getSheetByName(SHEET_NAMES.DOCUMENTS);
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  
  var documents = [];
  for (var i = 1; i < data.length; i++) {
    var doc = rowToDocument(data[i]);
    if (doc) documents.push(doc);
  }
  return documents;
}

/**
 * ID指定でドキュメントを取得
 */
function getDocumentById(docId) {
  var sheet = getSpreadsheet().getSheetByName(SHEET_NAMES.DOCUMENTS);
  if (!sheet) return null;
  
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === docId) {
      return rowToDocument(data[i]);
    }
  }
  return null;
}

/**
 * 行データをドキュメントオブジェクトに変換
 * カラム: ID, タイトル, 説明, GoogleドキュメントURL, 最終更新日
 */
function rowToDocument(row) {
  if (!row || !row[0]) return null;
  return {
    id: row[0],
    title: row[1],
    description: row[2],
    url: row[3] || '',
    updatedAt: row[4] || ''
  };
}

/**
 * ドキュメント管理シートのセットアップ（メタデータのみ）
 */
function setupDocumentSheet() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.DOCUMENTS);
  
  // 既に存在する場合はスキップ
  if (sheet) {
    // URLが空または無効（旧フォーマットのHTMLが入っている場合も含む）なドキュメントがないかチェック
    var data = sheet.getDataRange().getValues();
    var hasEmptyUrl = false;
    for (var i = 1; i < data.length; i++) {
      var url = data[i][3] || '';
      if (!url || url.indexOf('/document/d/') === -1) { hasEmptyUrl = true; break; }
    }
    if (!hasEmptyUrl) return;
    // URL不足分があればGoogleドキュメント作成へ
    createGoogleDocuments();
    return;
  }
  
  // 新しいシートを作成
  sheet = ss.insertSheet(SHEET_NAMES.DOCUMENTS);
  
  // ヘッダー行
  var headers = [['ID', 'タイトル', '説明', 'GoogleドキュメントURL', '最終更新日']];
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
  
  // 初期データ（メタデータのみ）
  var documents = [
    ['work-rules', '就業規則', '勤務時間、休日、服務規律など',
     'https://docs.google.com/document/d/WORK_RULES_PLACEHOLDER/edit', '2025/01/15'],
    ['leave-rules', '休暇規程', '有給休暇、特別休暇、育児・介護休暇など',
     'https://docs.google.com/document/d/LEAVE_RULES_PLACEHOLDER/edit', '2025/01/15'],
    ['attendance-manual', '勤怠管理マニュアル', '打刻方法、申請手順、承認フローなど',
     'https://docs.google.com/document/d/ATTENDANCE_MANUAL_PLACEHOLDER/edit', '2025/01/15'],
    ['agreement-36', '36協定について', '残業上限、特別条項、届出について',
     'https://docs.google.com/document/d/AGREEMENT_36_PLACEHOLDER/edit', '2025/02/01'],
    ['telework-rules', 'テレワーク規程', '在宅勤務の申請、勤怠管理、環境整備など',
     'https://docs.google.com/document/d/TELEWORK_RULES_PLACEHOLDER/edit', '2025/01/15'],
    ['faq', 'よくある質問（FAQ）', '勤怠・休暇に関するQ&A',
     'https://docs.google.com/document/d/FAQ_PLACEHOLDER/edit', '2025/01/15']
  ];
  
  sheet.getRange(2, 1, documents.length, headers[0].length).setValues(documents);
  
  // 列幅調整
  sheet.setColumnWidth(1, 200); // ID
  sheet.setColumnWidth(2, 250); // タイトル
  sheet.setColumnWidth(3, 400); // 説明
  sheet.setColumnWidth(4, 400); // URL
  sheet.setColumnWidth(5, 150); // 更新日
  
  // ヘッダー行を太字に
  sheet.getRange(1, 1, 1, headers[0].length).setFontWeight('bold');
  
  // Googleドキュメントを作成
  createGoogleDocuments();
  
  console.log('ドキュメントシートを作成しました');
}

/**
 * Googleドキュメントを作成し、スプレッドシートにURLを保存
 * ドキュメントの内容はGoogle Apps ScriptのDocumentAppで構築
 */
function createGoogleDocuments() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.DOCUMENTS);
  if (!sheet) return;
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;
  
  var updated = false;
  
  for (var i = 1; i < data.length; i++) {
    var docId = data[i][0];
    var title = data[i][1];
    var url = data[i][3] || '';
    
    // 既に有効なURLがある場合はスキップ（プレースホルダーでないかチェック）
    if (url && url.indexOf('PLACEHOLDER') === -1 && url.indexOf('/document/d/') > 0) continue;
    
    // Googleドキュメントを作成
    var doc = createDocumentContent(docId, title);
    if (!doc) continue;
    
    // URLをシートに保存
    sheet.getRange(i + 1, 4).setValue(doc.getUrl());
    sheet.getRange(i + 1, 5).setValue(Utilities.formatDate(new Date(), 'JST', 'yyyy/MM/dd'));
    
    updated = true;
    
    // API呼び出し制限を避けるため少し待機
    Utilities.sleep(1000);
  }
  
  if (updated) {
    console.log('Googleドキュメントを作成しました');
  }
}

/**
 * ドキュメントIDに応じたGoogleドキュメントの内容を作成
 */
function createDocumentContent(docId, title) {
  try {
    var doc = DocumentApp.create('【勤怠管理システム】' + title);
    var body = doc.getBody();
    
    // タイトル
    body.appendParagraph(title)
      .setHeading(DocumentApp.Heading.HEADING1)
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    
    body.appendParagraph(''); // 空行
    
    // 各ドキュメントの内容を構築
    switch (docId) {
      case 'work-rules':
        buildWorkRules(body);
        break;
      case 'leave-rules':
        buildLeaveRules(body);
        break;
      case 'attendance-manual':
        buildAttendanceManual(body);
        break;
      case 'agreement-36':
        buildAgreement36(body);
        break;
      case 'telework-rules':
        buildTeleworkRules(body);
        break;
      case 'faq':
        buildFAQ(body);
        break;
      default:
        body.appendParagraph('（ドキュメント準備中）');
    }
    
    // フッター
    body.appendParagraph('');
    body.appendParagraph('---');
    body.appendParagraph('最終更新: ' + Utilities.formatDate(new Date(), 'JST', 'yyyy年MM月dd日'));
    body.appendParagraph('勤怠管理システム');
    
    // 共有設定：リンクを知っている人は誰でも閲覧可能
    doc.setSharing(DocumentApp.Access.ANYONE_WITH_LINK, DocumentApp.Permission.VIEW);
    
    return doc;
  } catch (e) {
    console.error('Googleドキュメント作成エラー (' + docId + '): ' + e.message);
    return null;
  }
}

/**
 * 就業規則の内容を構築
 */
function buildWorkRules(body) {
  body.appendParagraph('第1章 総則').setHeading(DocumentApp.Heading.HEADING2);
  
  body.appendParagraph('（目的）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第1条 この就業規則は、株式会社XXX（以下「会社」という）の従業員の勤務条件、服務規律その他必要な事項を定めることを目的とします。');
  
  body.appendParagraph('（適用範囲）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第2条 この就業規則は、会社に雇用される全ての従業員に適用されます。');
  
  body.appendParagraph('第2章 勤務時間・休憩・休日').setHeading(DocumentApp.Heading.HEADING2);
  
  body.appendParagraph('（勤務時間）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第3条 始業及び終業の時刻は、次の通りとします。');
  body.appendParagraph('・通常勤務：9:00～18:00（休憩12:00～13:00）');
  body.appendParagraph('・フレックスタイム制：コアタイム 10:00～15:00');
  
  body.appendParagraph('（休憩）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第4条 勤務時間が6時間を超える場合は45分以上、8時間を超える場合は60分以上の休憩を取得するものとします。');
  
  body.appendParagraph('（休日）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第5条 休日は次の通りとします。');
  body.appendParagraph('・土曜日');
  body.appendParagraph('・日曜日');
  body.appendParagraph('・国民の祝日');
  body.appendParagraph('・年末年始（12月29日～1月3日）');
  body.appendParagraph('・その他会社が指定する日');
  
  body.appendParagraph('第3章 服務規律').setHeading(DocumentApp.Heading.HEADING2);
  
  body.appendParagraph('（服務）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第6条 従業員は、職務の遂行にあたり、誠実に業務を行うものとします。');
  
  body.appendParagraph('（遵守事項）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第7条 従業員は、次の事項を遵守しなければなりません。');
  body.appendParagraph('1. 服務規律を遵守し、職場の秩序を維持すること');
  body.appendParagraph('2. 職務上の秘密を漏洩しないこと');
  body.appendParagraph('3. 会社の施設、物品を適切に使用すること');
  body.appendParagraph('4. ハラスメント行為を行わないこと');
  body.appendParagraph('5. 安全衛生に関する規則を遵守すること');
}

/**
 * 休暇規程の内容を構築
 */
function buildLeaveRules(body) {
  body.appendParagraph('第1章 総則').setHeading(DocumentApp.Heading.HEADING2);
  
  body.appendParagraph('（目的）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第1条 この休暇規程は、従業員の休暇に関する取扱いを定めるものとします。');
  
  body.appendParagraph('第2章 年次有給休暇').setHeading(DocumentApp.Heading.HEADING2);
  
  body.appendParagraph('（付与日数）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第2条 年次有給休暇は、採用日から6ヶ月経過後に10日を付与し、その後は継続勤務年数に応じて以下の通り付与します。');
  
  // テーブル代わりに箇条書き
  body.appendParagraph('継続勤務年数と付与日数：');
  body.appendParagraph('・6ヶ月: 10日');
  body.appendParagraph('・1年6ヶ月: 11日');
  body.appendParagraph('・2年6ヶ月: 12日');
  body.appendParagraph('・3年6ヶ月: 14日');
  body.appendParagraph('・4年6ヶ月: 16日');
  body.appendParagraph('・5年6ヶ月: 18日');
  body.appendParagraph('・6年6ヶ月以上: 20日');
  
  body.appendParagraph('（時季指定）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第3条 年次有給休暇の取得時季は、従業員が申請し、会社が承認するものとします。ただし、会社は業務の正常な運営に支障がある場合、時季変更権を行使することができます。');
  
  body.appendParagraph('（繰越し）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第4条 年次有給休暇のうち、取得しなかったものは最大20日まで翌年に繰り越すことができます。');
  
  body.appendParagraph('（取得単位）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第5条 年次有給休暇は、全日、半日（午前・午後）、または時間単位（1時間単位）で取得することができます。');
  
  body.appendParagraph('第3章 特別休暇').setHeading(DocumentApp.Heading.HEADING2);
  
  body.appendParagraph('（特別休暇の種類）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第6条 特別休暇は以下の通りとします。');
  body.appendParagraph('・結婚休暇: 5日');
  body.appendParagraph('・配偶者の出産休暇: 2日');
  body.appendParagraph('・忌引休暇: 配偶者7日、父母・子5日、祖父母3日、兄弟姉妹3日');
  body.appendParagraph('・慶弔休暇: その他会社が認めるもの');
  
  body.appendParagraph('第4章 育児・介護休暇').setHeading(DocumentApp.Heading.HEADING2);
  
  body.appendParagraph('（育児休業）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第7条 従業員は、子が1歳に達するまで（一定の条件で最長2歳まで）育児休業を取得することができます。');
  
  body.appendParagraph('（介護休業）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第8条 従業員は、要介護状態にある家族を介護するため、通算93日までの介護休業を取得することができます。');
}

/**
 * 勤怠管理マニュアルの内容を構築
 */
function buildAttendanceManual(body) {
  body.appendParagraph('1. はじめに').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('このマニュアルでは、勤怠管理システムの基本的な操作方法について説明します。');
  
  body.appendParagraph('2. ログイン方法').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('(1) スプレッドシートを開きます。');
  body.appendParagraph('(2) メニューから「勤怠管理」→「Web表示」を選択します。');
  body.appendParagraph('(3) 社員選択画面で自分の名前を選択し、「ログイン」ボタンをクリックします。');
  
  body.appendParagraph('3. 打刻方法').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('（出勤打刻）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('(1) ダッシュボードにアクセスします。');
  body.appendParagraph('(2) 「出勤」ボタンをクリックします。');
  body.appendParagraph('(3) 「出勤を記録しました」と表示されれば完了です。');
  
  body.appendParagraph('（退勤打刻）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('(1) ダッシュボードにアクセスします。');
  body.appendParagraph('(2) 「退勤」ボタンをクリックします。');
  body.appendParagraph('(3) 「退勤を記録しました」と表示されれば完了です。');
  
  body.appendParagraph('4. 休暇申請手順').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('(1) サイドメニューから「休暇申請」を選択します。');
  body.appendParagraph('(2) 「新規申請」ボタンをクリックします。');
  body.appendParagraph('(3) 休暇種類、期間、理由を入力します。');
  body.appendParagraph('(4) 「申請する」ボタンをクリックします。');
  body.appendParagraph('(5) 上長の承認後に休暇が確定します。');
  
  body.appendParagraph('5. 承認フロー').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('【申請者】 申請 → 【上長】 承認/却下 → 【申請者】 完了通知');
  
  body.appendParagraph('6. 勤怠記録の確認').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('(1) サイドメニューから「勤怠記録」を選択します。');
  body.appendParagraph('(2) 月を選択して自分の勤怠を確認できます。');
  body.appendParagraph('(3) 「月間集計」で出勤日数や残業時間を確認できます。');
  
  body.appendParagraph('7. 注意事項').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('・出勤打刻は始業時刻に行ってください。');
  body.appendParagraph('・退勤打刻を忘れると、正確な勤怠管理ができなくなります。');
  body.appendParagraph('・休暇申請は事前に行ってください（急な場合は当日中）。');
  body.appendParagraph('・打刻忘れの場合は、管理者に連絡してください。');
}

/**
 * 36協定についての内容を構築
 */
function buildAgreement36(body) {
  body.appendParagraph('1. 36協定とは').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('36協定（さぶろくきょうてい）とは、労働基準法第36条に基づき、会社と労働者の代表が締結する「時間外労働・休日労働に関する協定」です。この協定を締結し、所轄労働基準監督署に届け出ることで、法定労働時間（1日8時間、週40時間）を超える労働が可能になります。');
  
  body.appendParagraph('2. 時間外労働の上限').setHeading(DocumentApp.Heading.HEADING2);
  
  body.appendParagraph('（通常の上限）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('・月45時間');
  body.appendParagraph('・年360時間');
  body.appendParagraph('・年間のうち、月45時間を超える月は6ヶ月以内');
  
  body.appendParagraph('（特別条項適用時の上限）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('・月100時間未満（休日労働を含む）');
  body.appendParagraph('・年720時間（休日労働を含む）');
  body.appendParagraph('・複数月平均80時間以内（休日労働を含む）');
  body.appendParagraph('・月45時間超は年6回まで');
  
  body.appendParagraph('3. 割増賃金').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('時間外労働には以下の割増率が適用されます。');
  body.appendParagraph('・時間外労働（月60時間まで）: 25%増し');
  body.appendParagraph('・時間外労働（月60時間超）: 50%増し');
  body.appendParagraph('・深夜労働（22:00～5:00）: 25%増し');
  body.appendParagraph('・休日労働: 35%増し');
  body.appendParagraph('・時間外＋深夜: 50%増し');
  
  body.appendParagraph('4. 残業時間の確認方法').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('(1) システムにログインし、サイドメニューから「残業状況」を選択します。');
  body.appendParagraph('(2) 36協定ステータスで現在の残業状況を確認できます。');
  body.appendParagraph('(3) 月間・年間の残業時間がプログレスバーで表示されます。');
  body.appendParagraph('(4) 警告レベルを超えた場合は、ステータスバッジで通知されます。');
  
  body.appendParagraph('5. 健康確保措置').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('月45時間を超える時間外労働を行った従業員に対しては、以下の健康確保措置を実施します。');
  body.appendParagraph('・医師による面接指導の実施');
  body.appendParagraph('・勤務間インターバル確保の推奨');
  body.appendParagraph('・長時間労働者への注意喚起');
}

/**
 * テレワーク規程の内容を構築
 */
function buildTeleworkRules(body) {
  body.appendParagraph('第1章 総則').setHeading(DocumentApp.Heading.HEADING2);
  
  body.appendParagraph('（目的）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第1条 このテレワーク規程は、従業員がテレワーク（在宅勤務）を行うにあたり、必要な事項を定めるものとします。');
  
  body.appendParagraph('（定義）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第2条 テレワークとは、情報通信技術を利用して、通常の勤務場所（オフィス）以外の場所で業務を行うことをいいます。');
  
  body.appendParagraph('第2章 対象者と要件').setHeading(DocumentApp.Heading.HEADING2);
  
  body.appendParagraph('（対象者）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第3条 テレワークの対象者は、以下の全ての条件を満たす従業員とします。');
  body.appendParagraph('1. 入社から6ヶ月以上経過していること');
  body.appendParagraph('2. 業務上、テレワークが可能な職種であること');
  body.appendParagraph('3. 所属長の推薦があること');
  
  body.appendParagraph('第3章 申請手続き').setHeading(DocumentApp.Heading.HEADING2);
  
  body.appendParagraph('（申請方法）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第4条 テレワークを希望する従業員は、テレワーク申請書を所属長に提出し、承認を得なければなりません。');
  
  body.appendParagraph('（実施日）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第5条 テレワークの実施日は、原則として週3日以内とします。');
  
  body.appendParagraph('第4章 勤務ルール').setHeading(DocumentApp.Heading.HEADING2);
  
  body.appendParagraph('（勤務時間）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第6条 テレワーク中の勤務時間は、通常の勤務時間と同様とします。');
  
  body.appendParagraph('（勤怠管理）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第7条 テレワーク実施日も、通常通りシステムへの出退勤打刻を行うものとします。');
  
  body.appendParagraph('第5章 環境整備').setHeading(DocumentApp.Heading.HEADING2);
  
  body.appendParagraph('（情報セキュリティ）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第8条 テレワーク実施にあたり、以下のセキュリティ対策を徹底しなければなりません。');
  body.appendParagraph('1. VPN接続の利用');
  body.appendParagraph('2. 画面ロックの徹底');
  body.appendParagraph('3. 機密情報の適切な取扱い');
  body.appendParagraph('4. 公衆Wi-Fiの利用禁止');
  
  body.appendParagraph('（費用負担）').setHeading(DocumentApp.Heading.HEADING3);
  body.appendParagraph('第9条 テレワークに必要な通信費用は、会社が定める基準に基づき補助します。');
}

/**
 * FAQの内容を構築
 */
function buildFAQ(body) {
  body.appendParagraph('Q1. 打刻を忘れてしまいました').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('管理者または上長に連絡し、勤怠記録の修正を依頼してください。システム上でも後から修正申請が可能です。');
  
  body.appendParagraph('Q2. 自分の休暇残数を確認したい').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('システムにログイン後、サイドメニューの「休暇残数」から確認できます。年次有給休暇の付与日数、使用日数、残日数が一覧で表示されます。');
  
  body.appendParagraph('Q3. 半日休暇の申請方法を教えてください').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('休暇申請フォームで、取得単位を「午前」または「午後」に選択して申請してください。半日休暇は0.5日として計算されます。');
  
  body.appendParagraph('Q4. 休暇の申請期限はありますか').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('原則として、休暇開始日の3営業日前までに申請してください。ただし、急な事情の場合は当日でも受け付けます。');
  
  body.appendParagraph('Q5. 残業時間の上限はありますか').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('36協定に基づき、月45時間、年360時間が上限です。特別条項適用時は月100時間未満、年720時間となります。システムの「残業状況」ページで現在の残業時間を確認できます。');
  
  body.appendParagraph('Q6. 深夜残業とは何ですか').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('22:00から5:00までの時間帯の労働を深夜労働といい、通常の賃金に25%以上の割増率が適用されます。');
  
  body.appendParagraph('Q7. ログインできない場合はどうすればよいですか').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('管理者に連絡してください。社員情報が正しく登録されているか、アカウントが有効かどうかを確認します。');
  
  body.appendParagraph('Q8. 有給休暇の繰り越しはできますか').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('当年中に取得しなかった年次有給休暇は、最大20日まで翌年に繰り越すことができます。');
  
  body.appendParagraph('Q9. テレワーク申請はどうすればよいですか').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('「テレワーク規程」をご確認の上、所属長に相談し、承認を得てください。');
  
  body.appendParagraph('Q10. 勤怠の修正はどうすればよいですか').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('管理者または上長に連絡し、修正依頼を行ってください。修正が必要な場合は、管理者がシステム上で修正を行います。');
  
  body.appendParagraph('Q11. 年間の残業時間はどこで確認できますか').setHeading(DocumentApp.Heading.HEADING2);
  body.appendParagraph('システムの「残業状況」ページで、月間および年間の残業時間をプログレスバーで確認できます。36協定のステータスも同時に表示されます。');
}
