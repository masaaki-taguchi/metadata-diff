'use strict';

const fs = require('fs');
const readline = require('readline');
const iconv = require('iconv-lite');
const encoding = require('encoding-japanese');

const ENABLE_LOGGING = true;
const COMMAND_OPTION_HELP = '-h';
const COMMAND_OPTION_OUTPUT_PATH_NAME = '-o';

const DEFAULT_DIFF_RESULT = 'diff.txt';
const DEFAULT_OUTPUT_PATH = 'diff_result';

// diffコマンドで出力した結果の文字コードによって、DEFAULT_DIFF_CHARSETの指定を変更してください。
//const DEFAULT_DIFF_CHARSET = 'Shift_JIS';
const DEFAULT_DIFF_CHARSET = 'UTF-8';

let paramList = [];
let paramCnt = 0;
let inputFileName = null;
let outputPath = DEFAULT_OUTPUT_PATH;

for (let i = 2; i < process.argv.length; i++) {
  paramCnt++;
  if (process.argv[i] === COMMAND_OPTION_HELP) {
    usage();
  } else if (process.argv[i] === COMMAND_OPTION_OUTPUT_PATH_NAME) {
    if (!process.argv[i + 1]) usage();
    outputPath = process.argv[++i];
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
    logging('The file does not exist. Filename : ' + inputFileName);
    process.exit(1);
  }

  let diffMetadatas = [];
  let stream = fs.createReadStream(inputFileName).pipe(iconv.decodeStream(DEFAULT_DIFF_CHARSET));
  let reader = readline.createInterface({ input: stream });

  let group1 = null;
  let group2 = null;
  let filePath = null;
  let dirPath = null;
  let fileContent = null;

  for await (const line of reader) {
    let differResult1 = /^diff .*? \"*metadata1.*?\/(.+?)\"*\s\"*metadata2\//.exec(line);
    let differResult2 = /^Only .+?\/(.+?): (.+)/.exec(line);
    let differResult3 = /^Binary files .+?\/(.+?) and/.exec(line);
    if (differResult1 || differResult2 || differResult3) {
      if (fileContent) writeFile(filePath, fileContent);
      fileContent = '';
      if (differResult1) {
        group1 = differResult1[1];
        group2 = null;
      } else if (differResult2) {
        group1 = differResult2[1];
        group2 = differResult2[2];
      } else if (differResult3) {
        group1 = differResult3[1];
        group2 = null;
      }
      if (/^diff/.exec(line) || /^Binary files/.exec(line)) {
        filePath = group1;
        filePath = decordStr(filePath);
        dirPath = filePath;
        dirPath = dirPath.replace(/^(.+)\/(.*)$/, '$1');
        if (dirPath === filePath) {
          dirPath = '';
        }
      } else {
        filePath = group1 + '/' + group2;
        filePath = decordStr(filePath);
        dirPath = filePath;
        dirPath = ~dirPath.replace(/^(.+)\/(.*)$/, '$1');
      }
      console.log(filePath);

      if (dirPath) {
        let dirWork = outputPath + '/' + dirPath;
        if (!fs.existsSync(dirWork)) {
          fs.mkdirSync(dirWork, {
            recursive: true,
          });
        }
      }

      fileContent += line + '\n';
    } else {
      fileContent += line + '\n';
    }
  }
  if (fileContent) writeFile(filePath, fileContent);
})();


function decordStr(str) {
  if (!str) return '';
  str = str.replace(/\\u([\d\w]{4})/gi, (match, grp) => String.fromCharCode(parseInt(grp, 16)))
           .replace(/\\([\d\w]{3})/gi, (match, grp) => String.fromCharCode(parseInt(grp, 8)));

  const utf8Array = encoding.stringToCode(str);
  const unicodeArray = encoding.convert(utf8Array, {
    to: 'UNICODE',
    from: 'UTF8'
  });
  let decordStr = encoding.codeToString(unicodeArray);

  return decordStr;
}

function writeFile(filePath, fileContent) {
  let filePathWork = outputPath + '/' + filePath;
  let fileContentArray = fileContent.split(/\n/);
  if (fileContentArray.length <= 3) {
      let fileContentWork = decordStr(fileContent);
      fs.writeFileSync(filePathWork, fileContentWork);
  } else {
      let fileContentWork = '';
      for (let i = 0; i < 3; i++) {
          fileContentWork += fileContentArray[i] + '\n';
      }
      fileContentWork = decordStr(fileContentWork);
      for (let i = 3; i < fileContentArray.length; i++) {
          fileContentWork += fileContentArray[i] + '\n';
      }
      fs.writeFileSync(filePathWork, fileContentWork);
  }
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
  console.log('usage: slice_diff_result.js [-options] target_diff_file');
  console.log('    -h              output usage information');
  console.log('    -o <outputname> specifies output path(default is diff_result)');
  process.exit(0);
}

