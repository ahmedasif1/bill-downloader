import * as fs from 'fs';
import * as readline from 'readline';
import * as util from 'util';
import { exec } from 'child_process';
const execPromise = util.promisify(exec);
import { format, parse } from 'date-fns';
const DOWNLOADS_PATH = 'downloads';
const DATA_PATH = 'data';
const STATUS_FILE_PATH = `${DATA_PATH}/status.json`;
const TMP_DIR = 'tmp';

const Utils = {
    waitFor: async (timeMillis) => {
        await new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve(null);
            }, timeMillis)
        })
    },
    chromeBinary: async () => {
        let binaryName = 'google-chrome'
        try {
            await execPromise(`command -v google-chrome`);
        } catch (error) {
            binaryName = 'chromium';
        }

        return binaryName;
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
        if (!fs.existsSync(`./customer_ids.json`)) {
            return {};
        }
        return JSON.parse(fs.readFileSync(`./customer_ids.json`));
    },

    readStatus: () => {
        if (!fs.existsSync(`./${STATUS_FILE_PATH}`)) {
            return {};
        }
        return JSON.parse(fs.readFileSync(`./${STATUS_FILE_PATH}`));
    },

    saveWithWget: async (url, isPdf, billData, billMonthIdentifier) => {
        const id = billData['id']
        let billMonthFinal = billMonthIdentifier.replace(/\s+/g, '-');
        let date = null;
        let dateFormats = ['dd-MMM-yyX', 'dd-MM-yyyyX']

        console.log(`Parsing date ${billMonthFinal + 'Z'} with format ${dateFormats[0]}`)
        date = parse(billMonthFinal + 'Z', dateFormats[0], new Date());
        if (date == 'Invalid Date') {
            console.log(`Parsing date ${billMonthFinal + 'Z'} with format ${dateFormats[1]}`)
            date = parse(billMonthFinal + 'Z', dateFormats[1], new Date());
        }

        console.log('Date value: ', date)
        billMonthFinal = format(date, 'yyyy-MM-dd');
        if (!fs.existsSync(`${DOWNLOADS_PATH}/${billMonthFinal}`)) {
            fs.mkdirSync(`${DOWNLOADS_PATH}/${billMonthFinal}`);
        }

        Utils.log(url);
        let command = `wget -e robots=off "${url}"`;

        if (isPdf) {
            command = `cd ${DOWNLOADS_PATH}/${billMonthFinal} && ${command} -O ${id}.pdf`
        } else {
            command = `mkdir -p ${TMP_DIR} && cd ${TMP_DIR} && touch 1 && rm -rf * && ${command} -p -k -r -l 1 -R *.js`
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
            await Utils.convertHtmlToPdf(billData, billMonthFinal);
        }
        Utils.log('Bill Downloaded');

    },

    saveStatus: (status) => {
        console.log('Saving status')
        fs.writeFileSync(STATUS_FILE_PATH, JSON.stringify(status, null, 4));
    },

    log: (message) => {
        console.log(`[${format(new Date(), "yyyy-MM-dd kk:mm:ss")}] - ${message}`);
    },

    convertHtmlToPdf: async (billData, billMonthFinal) => {
        const id = billData['id']
        await Utils.addHtmlExtension(TMP_DIR);
        console.log('Bill data in convertHtmlToPdf: ', billData);
        if (billData['format'] === 'html') {
            await Utils.fixCssForPrinting();
        }
        const pdfPath = `${DOWNLOADS_PATH}/${billMonthFinal}/${id}.pdf`;
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
                console.log(strToPrint, 'retrying');
            } else {
                console.log(strToPrint, 'throwing exception');
                throw 'PDF file size too small';
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
        let command = `${chromePath} --headless --print-to-pdf="${downloadPath}" -virtual-time-budget=200000 \`find ${TMP_DIR} -name bill.html\``
        Utils.log(command);
        const { stdout, stderr } = await execPromise(command);
        if (stderr) {
            Utils.log(`error: ${stderr}`);
        }
    },

    addHtmlExtension: async (path) => {
        const command = `find ${path} -name '*asp*' ! -name '*html' -execdir mv {} bill.html \\;`;
        Utils.log(command);
        const { stdout, stderr } = await execPromise(command);
        if (stderr) {
            Utils.log(`error: ${stderr.message}`);
        }
    },

    fixCssForPrinting: async () => {
        const command = `find ${TMP_DIR} -name 'bill.html' -exec sed -i 's/padding-top:\\s*[[:digit:]]\\+mm;/padding-top:12mm;margin-left:12mm;/' {} \\; -exec sed -i 's/<script.*<\\/script>//g;' {} \\;`;
        Utils.log(command);
        await execPromise(command);
        const { stdout, stderr } = execPromise(command)
        if (stderr) {
            Utils.log(`error: ${stderr.message}`);
        }
    }

}

export { Utils };
