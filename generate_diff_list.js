"use strict";

const XLSX = require("xlsx-populate");
const fs = require("fs");
const readline = require("readline");
const iconv = require("iconv-lite");

const ENABLE_LOGGING = true;
const COMMAND_OPTION_HELP = "-h";
const COMMAND_OPTION_OUTPUT_FILE_NAME = "-o";
const COMMAND_OPTION_METADATA1_NAME = "-m1";
const COMMAND_OPTION_METADATA2_NAME = "-m2";
const COMMAND_OPTION_INCLUDE_IDENTICAL_LINE = "-i";

const DIFF_RESULT_LIST = "diff_list.txt";
const TEMPLATE_EXCEL = "template.xlsx";
const DEFAULT_OUTPUT_FILE_NAME = "diff_list.xlsx";
const DEFAULT_METADATA1_NAME = "Metadata1";
const DEFAULT_METADATA2_NAME = "Metadata2";

// diffコマンドで出力した結果の文字コードによって、DEFAULT_DIFF_CHARSETの指定を変更してください。
//const DEFAULT_DIFF_CHARSET = "Shift_JIS";
const DEFAULT_DIFF_CHARSET = "UTF-8";

const METADATA_KIND = new Map([
  ["appMenus", "アプリケーションメニュー"],
  ["applications", "アプリケーション"],
  ["approvalProcesses", "承認プロセス"],
  ["aura", "LightningAuraコンポーネント"],
  ["authproviders", "認証プロバイダ"],
  ["classes", "Apexクラス"],
  ["cleanDataServices", "cleanDataServices"],
  ["connectedApps", "接続アプリケーション"],
  ["customMetadata", "カスタムメタデータ"],
  ["dashboards", "ダッシュボード"],
  ["duplicateRules", "重複ルール"],
  ["email", "メールテンプレート"],
  ["flexipages", "Lightningページ"],
  ["flowDefinitions", "フロー定義"],
  ["flows", "フロー"],
  ["globalValueSets", "グローバル選択リスト"],
  ["installedPackages", "インストールパッケージ"],
  ["labels", "カスタム表示ラベル"],
  ["layouts", "ページレイアウト"],
  ["lwc", "LightningWebコンポーネント"],
  ["namedCredentials", "指定ログイン"],
  ["notificationTypeConfig", "標準通知/カスタム通知種別"],
  ["objectTranslations", "翻訳"],
  ["objects", "オブジェクト定義"],
  ["permissionsets", "権限セット"],
  ["profilePasswordPolicies", "プロファイルパスワードポリシー"],
  ["profiles", "プロファイル"],
  ["quickActions", "クイックアクション"],
  ["queues", "キュー"],
  ["reportTypes", "レポートタイプ"],
  ["reports", "レポート"],
  ["settings", "組織の設定"],
  ["sharingRules", "共有ルール"],
  ["staticresources", "静的リソース"],
  ["triggers", "Apexトリガ"],
  ["workflows", "ワークフロー"],
]);

global.enabledLogging = ENABLE_LOGGING;

let paramList = [];
let paramCnt = 0;
let inputFileName = null;
let outputFileName = DEFAULT_OUTPUT_FILE_NAME;
let metadata1Name = DEFAULT_METADATA1_NAME;
let metadata2Name = DEFAULT_METADATA2_NAME;
let existsIdenticalOption = false;

for (let i = 2; i < process.argv.length; i++) {
  paramCnt++;
  if (process.argv[i] === COMMAND_OPTION_HELP) {
    usage();
  } else if (process.argv[i] === COMMAND_OPTION_OUTPUT_FILE_NAME) {
    if (!process.argv[i + 1]) usage();
    outputFileName = process.argv[++i];
  } else if (process.argv[i] === COMMAND_OPTION_METADATA1_NAME) {
    if (!process.argv[i + 1]) usage();
    metadata1Name = process.argv[++i];
  } else if (process.argv[i] === COMMAND_OPTION_METADATA2_NAME) {
    if (!process.argv[i + 1]) usage();
    metadata2Name = process.argv[++i];
  } else if (process.argv[i] === COMMAND_OPTION_INCLUDE_IDENTICAL_LINE) {
    existsIdenticalOption = true;
  } else {
    inputFileName = process.argv[i];
  }
}
if (paramCnt < 1) {
  usage();
}

(async () => {
  let existsFile = fs.existsSync(inputFileName);
  if (!existsFile) {
    logging("The file does not exist. Filename : " + inputFileName);
    process.exit(1);
  }

  let diffMetadatas = [];
  let stream = fs
    .createReadStream(inputFileName)
    .pipe(iconv.decodeStream(DEFAULT_DIFF_CHARSET));
  let reader = readline.createInterface({ input: stream });
  for await (const line of reader) {
    let differ_result = /^Files metadata1\/force-app\/main\/default\/(.+?) and metadata2\/force-app\/main\/default\/(.+?) differ$/.exec(line);
    let only_result = /^Only in (metadata[1|2])\/force-app\/main\/default\/(.+?): (.+?)$/.exec(line);
    let only_result2 = /^Only in (metadata[1|2])\/force-app\/main\/default: (.+?)$/.exec(line);
    let identical_result = /^Files metadata1\/force-app\/main\/default\/(.+?) and metadata2\/force-app\/main\/default\/(.+?) are identical$/.exec(line);

    let environment = "";
    let path = "";
    let file = "";
    let emptyFlag = false;
    let identicalFlag = false;
    let kind = "";
    if (differ_result) {
      let work = /(.+\/)?(.+)$/.exec(differ_result[1]);
      emptyFlag = false;
      identicalFlag = false;
      environment = "";
      path = work[1];
      if (path.slice(-1) === "/") {
        path = path.slice(0, -1);
      }
      file = work[2];
    } else if (only_result) {
      emptyFlag = true;
      identicalFlag = false;
      environment = only_result[1];
      path = only_result[2];
      if (path.slice(-1) === "/") {
        path = path.slice(0, -1);
      }
      file = only_result[3];
    } else if (only_result2) {
      emptyFlag = true;
      identicalFlag = false;
      environment = only_result2[1];
      path = only_result2[2];
      if (path.slice(-1) === "/") {
        path = path.slice(0, -1);
      }
      file = only_result2[2];
    } else if (identical_result) {
      let work = /(.+\/)?(.+)$/.exec(identical_result[1]);
      emptyFlag = false;
      identicalFlag = true;
      environment = "";
      path = work[1];
      if (path.slice(-1) === "/") {
        path = path.slice(0, -1);
      }
      file = work[2];
    } else {
      logging("Found the unknown format: " + line);
    }

    let diffMetadata = new _diffMetadata(environment, path, file, emptyFlag, identicalFlag);
    diffMetadatas.push(diffMetadata);
  }

  await XLSX.fromFileAsync(TEMPLATE_EXCEL).then((workBook) => {
    let xlsxSheet = workBook.sheet(0);
    let xlsxCell = undefined;
    let templateStyleList = getTemplateStyleList(xlsxSheet);

    xlsxCell = xlsxSheet.row(2).cell(5);
    xlsxCell.value(metadata1Name);
    xlsxCell = xlsxSheet.row(2).cell(6);
    xlsxCell.value(metadata2Name);

    let resultWorkY = 3;
    let number = 1;
    for (let diffMetadata of diffMetadatas) {
      let environment = diffMetadata.environment;
      let path = diffMetadata.path;
      let file = diffMetadata.file;
      let emptyFlag = diffMetadata.emptyFlag;
      let identicalFlag = diffMetadata.identicalFlag;
      if (identicalFlag && !existsIdenticalOption) continue;
      putTemplateStyle(xlsxSheet, templateStyleList, resultWorkY);

      xlsxCell = xlsxSheet.row(resultWorkY).cell(1);
      xlsxCell.value(number);

      let pathArray = path.split("/");
      xlsxCell = xlsxSheet.row(resultWorkY).cell(2);
      xlsxCell.value(path);

      let kind = pathArray[0];
      if (METADATA_KIND.has(kind)) {
        kind = METADATA_KIND.get(kind);
      }
      xlsxCell = xlsxSheet.row(resultWorkY).cell(4);
      xlsxCell.value(kind);

      xlsxCell = xlsxSheet.row(resultWorkY).cell(3);
      xlsxCell.value(file);

      if (!emptyFlag) {
        if (identicalFlag) {
          xlsxCell = xlsxSheet.row(resultWorkY).cell(5);
          xlsxCell.value("差分無し");
          xlsxCell.style("fill", "bdd7ee");
          xlsxCell = xlsxSheet.row(resultWorkY).cell(6);
          xlsxCell.value("差分無し");
          xlsxCell.style("fill", "bdd7ee");
        } else {
          xlsxCell = xlsxSheet.row(resultWorkY).cell(5);
          xlsxCell.value("差分有り");
          xlsxCell.style("fill", "fff2cc");
          xlsxCell = xlsxSheet.row(resultWorkY).cell(6);
          xlsxCell.value("差分有り");
          xlsxCell.style("fill", "fff2cc");
        }
      } else {
        if (environment === "metadata1") {
          xlsxCell = xlsxSheet.row(resultWorkY).cell(5);
          xlsxCell.value("存在有り");
          xlsxCell.style("fill", "ffcccc");
          xlsxCell = xlsxSheet.row(resultWorkY).cell(6);
          xlsxCell.value("存在無し");
          xlsxCell.style("fill", "bfbfbf");
        } else {
          xlsxCell = xlsxSheet.row(resultWorkY).cell(5);
          xlsxCell.value("存在無し");
          xlsxCell.style("fill", "bfbfbf");
          xlsxCell = xlsxSheet.row(resultWorkY).cell(6);
          xlsxCell.value("存在有り");
          xlsxCell.style("fill", "ffcccc");
        }
      }

      resultWorkY++;
      number++;
    }
    workBook.toFileAsync(outputFileName).then((result) => {});
  });
})();

function _diffMetadata(environment, path, file, emptyFlag, identicalFlag) {
  this.environment = environment !== undefined ? String(environment) : "";
  this.path = path !== undefined ? String(path) : "";
  this.file = file !== undefined ? String(file) : "";
  this.emptyFlag = emptyFlag;
  this.identicalFlag = identicalFlag;
}

function putTemplateStyle(xlsxSheet, xlsxTemplateStyleList, cellY) {
  for (let i = 0; i < xlsxTemplateStyleList.length; i++) {
    let cell = xlsxSheet.cell(cellY, i + 1);
    cell.style(xlsxTemplateStyleList[i]);
  }
}

function getTemplateStyleList(xlsxSheet) {
  const end_col_num = xlsxSheet.usedRange().endCell().columnNumber();
  let xlsxTemplateStyleList = new Array();
  for (let i = 1; i <= end_col_num; i++) {
    let style = xlsxSheet.cell(3, i).style([
      "bold",
      "italic",
      "underline",
      "strikethrough",
      "subscript",
      "superscript",
      "fontSize",
      "fontFamily",
      "fontColor",
      "horizontalAlignment",
      "justifyLastLine",
      "indent",
      "verticalAlignment",
      "wrapText",
      "shrinkToFit",
      "textDirection",
      "textRotation",
      "angleTextCounterclockwise",
      "angleTextClockwise",
      "rotateTextUp",
      "rotateTextDown",
      "verticalText",
      "fill",
      "border",
      "borderColor",
      "borderStyle",
      "diagonalBorderDirection",
      "numberFormat",
    ]);
    xlsxTemplateStyleList.push(style);
  }

  return xlsxTemplateStyleList;
}

function logging(message) {
  _logging(message);
}

function _logging(message) {
  if (global.enabledLogging) {
    console.log(message);
  }
}

function usage() {
  console.log("usage: generate_diff_list.js [-options] target_diff_list_file");
  console.log("    -h                  output usage information");
  console.log("    -o <outputname>     specifies output file name(default is diff_list.xlsx)");
  console.log("    -m1 <metadata1name> specifies the name of metadata1 in excel(default is Metadata1)");
  console.log("    -m2 <metadata2name> specifies the name of metadata2 in excel(default is Metadata2)");
  console.log("    -i                  include identical line");
  process.exit(0);
}
