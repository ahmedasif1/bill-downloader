import * as fs from 'fs';
import * as util from 'util';
import * as os from 'node:os';
import { exec } from 'child_process';
const execPromise = util.promisify(exec);
import { format } from 'date-fns';
import { FormData } from 'node-fetch';
import * as path from 'path';
const DOWNLOADS_PATH = 'downloads';
const DATA_PATH = 'data';
const STATUS_FILE_PATH = `${DATA_PATH}/status.json`;
const TMP_DIR = 'tmp';


const Utils = {
  waitFor: async (timeMilliseconds) => {
    await new Promise((resolve) => {
      setTimeout(() => {
        resolve(null);
      }, timeMilliseconds);
    });
  },
  chromeBinary: async () => {
    let binaries = [
      'google-chrome',
      'chromium',
      '/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome'
    ];
    for (let binary of binaries) {
      try {
        Utils.log('Trying binary: ', binary);
        await execPromise('command -v ' + binary);
        return binary;
      } catch (error) {
        Utils.log('Trying next binary');
      }
    }
    return null;
  },

  setInitialConfig: () => {
    if (!fs.existsSync(DOWNLOADS_PATH)) {
      fs.mkdirSync(DOWNLOADS_PATH);
    }

    if (!fs.existsSync(DATA_PATH)) {
      fs.mkdirSync(DATA_PATH);
    }

    if (!fs.existsSync(STATUS_FILE_PATH)) {
      fs.writeFileSync(STATUS_FILE_PATH, JSON.stringify({}));
    }
  },

  readCustomerIds: async () => {
    if (!fs.existsSync('./customer_ids.json')) {
      return {};
    }
    return JSON.parse(fs.readFileSync('./customer_ids.json'));
  },

  readStatus: () => {
    if (!fs.existsSync(`./${STATUS_FILE_PATH}`)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(`./${STATUS_FILE_PATH}`));
  },

  makeFolder: (folderPath) => {
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
  },

  downloadWithCurl: async (pdfUrl, cookies, billData, billMonthDate, fileName) => {
    const billMonthFinal = format(billMonthDate, 'yyyy-MM');
    const folderPath = `${DOWNLOADS_PATH}/${billMonthFinal}/${billData['tag']}`;
    Utils.makeFolder(folderPath);
    let command = `curl '${pdfUrl}' -H 'Cookie: ${cookies}' -o ${folderPath}/${fileName}`;
    Utils.log(command);
    const { stdout, stderr } = await execPromise(command);
                
    Utils.log(stdout);
    Utils.log(stderr);
        
    //set permissions
    command = `chmod +r "${folderPath}/${fileName}"`;
    Utils.log(command);
    await execPromise(command);

  },

  getAndCreateDownloadsPath: (billData, billMonthDate) => {
    Utils.log('Date value: ', billMonthDate);
    const billMonthFinal = format(billMonthDate, 'yyyy-MM');
    const folderPath = `${DOWNLOADS_PATH}/${billMonthFinal}/${billData['tag']}`;
    Utils.makeFolder(folderPath);
    return folderPath;
  },

  emptyTmpFolder: async () => {
    await execPromise(`rm -rf ${TMP_DIR}`);
  },

  saveWithWget: async (url, isPdf, billData, billMonthDate) => {
    const id = billData['id'];

    const folderPath = this.getAndCreateDownloadsPath(billData, billMonthDate);

    Utils.log(url);
    let command = `wget -e robots=off "${url}"`;

    if (isPdf) {
      command = `cd ${folderPath} && ${command} -O ${id}.pdf`;
    } else {
      command = `mkdir -p ${TMP_DIR} && cd ${TMP_DIR} && touch 1 && rm -rf * && ${command} -p -k -r -l 1 -R *.js`;
    }
    Utils.log(command);
    const { stdout, stderr } = await execPromise(command);
    if (stdout) {
      Utils.log('stdout:', stdout);
    }
    if (stderr) {
      Utils.log('stderr:', stderr);
    }
    if (!isPdf) {
      Utils.log('Sleeping for 1s');
      await Utils.waitFor(1000);
      await Utils.convertHtmlToPdf(billData, folderPath);
    }
    Utils.log('Bill Downloaded');

  },

  saveStatus: (status) => {
    Utils.log('Saving status');
    fs.writeFileSync(STATUS_FILE_PATH, JSON.stringify(status, null, 4));
  },

  log: (...message) => {
    console.log(`[${format(new Date(), 'yyyy-MM-dd kk:mm:ss')}] - `, ...message);
  },

  convertHtmlToPdf: async (billData, folderPath) => {
    const id = billData['id'];
    await Utils.addHtmlExtension(TMP_DIR);
    await Utils.fixImageExtension(TMP_DIR);
    Utils.log('Bill data in convertHtmlToPdf: ', billData);
    await Utils.fixCssForPrinting();
    const pdfPath = `${folderPath}/${id}.pdf`;
    Utils.log('Sleeping for 1s');
    await Utils.waitFor(1000);
    await Utils.printToPdf(pdfPath, TMP_DIR);

    for (let tries = 0; ; ++tries) {
      const { size } = fs.statSync(pdfPath);
      Utils.log('PDF file size :' + size);

      if (size > 100000) {
        break;
      }
      let strToPrint = 'PDF file size is too small, ';
      if (tries < 2) {
        Utils.log(strToPrint, 'retrying');
      } else {
        Utils.log(strToPrint, 'throwing exception');
        throw new Error('PDF file size too small');
      }
      await Utils.printToPdf(pdfPath, TMP_DIR);

    }
    //set permissions
    const command = `chmod +r "${pdfPath}"`;
    Utils.log(command);
    await execPromise(command);
  },

  printToPdf: async (downloadPath, TMP_DIR) => {
    const chromePath = await Utils.chromeBinary();
    let command = `${chromePath} --headless --print-to-pdf="${downloadPath}" -virtual-time-budget=200000 \`find ${TMP_DIR} -name bill.html\``;
    Utils.log(command);
    const { stderr } = await execPromise(command);
    if (stderr) {
      Utils.log(`error: ${stderr}`);
    }
  },

  addHtmlExtension: async (path) => {
    const command = `find ${path} -name '*asp*' ! -name '*html' -execdir mv {} bill.html \\;`;
    Utils.log(command);
    const { stderr } = await execPromise(command);
    if (stderr) {
      Utils.log(`error: ${stderr.message}`);
    }
  },

  fixImageExtension: async(path) => {
    const command = `find ${path} -name 'ChartImg*' ! -name '*png' -execdir mv {} ChartImg.png \\;`;
    Utils.log(command);
    const { stderr } = await execPromise(command);
    if (stderr) {
      Utils.log(`error: ${stderr.message}`);
    }
  },

  fixCssForPrinting: async () => {
    // these commands work OK on linux, not on macOS/BSD
    let backupFile = os.platform().includes('darwin') ? '.bak -E' : '-r';
    const command = `find ${TMP_DIR} -name 'bill.html' -exec sed -i ${backupFile} 's/ChartImg.axd[\\/?=\\.;%a-z0-9_&]+"/ChartImg.png"/gi;' {} \\;`;
    Utils.log(command);
    const { stderr, stdout } = await execPromise(command);
    if (stderr) {
      Utils.log(`error: ${stderr}`);
    }
    Utils.log(stdout);
  },

  parseCookies(response) {
    const raw = response.headers.raw()['set-cookie'];
    return raw.map((entry) => entry.split(';')[0]).join(';');
  },

  mapToFormData: (map) => {
    const formData = new FormData();
    Object.entries(map).forEach(([key, value]) => {
      formData.append(key, value);
    });
    return formData;
  },

  writeTmpFile: (fileContent, relativePath) => {
    const dirName = path.dirname(`${TMP_DIR}/${relativePath}`);
    Utils.makeFolder(dirName);
    return fs.writeFileSync(`${TMP_DIR}/${relativePath}`, fileContent);
  }

};

export { Utils };
