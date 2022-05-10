import * as fs from 'fs';
import * as readline from 'readline';
import * as util from 'util';
import { exec } from 'child_process'; 
const execPromise = util.promisify(exec);
import { format, parse } from  'date-fns';
const DOWNLOADS_PATH = 'downloads';
const DATA_PATH = 'data';
const STATUS_FILE_PATH =  `${DATA_PATH}/status.json`;
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
        if(!fs.existsSync(DOWNLOADS_PATH)) {
            fs.mkdirSync(DOWNLOADS_PATH);
        }

        if(!fs.existsSync(DATA_PATH)) {
            fs.mkdirSync(DATA_PATH);
        }

        if(!fs.existsSync(STATUS_FILE_PATH)) {
            fs.writeFileSync(STATUS_FILE_PATH, JSON.stringify({}));
        }
    },

    readCustomerIds: async () => {
        let customerIDs = [];

        const file = readline.createInterface({
            input: fs.createReadStream('customer_ids.txt'),
            output: process.stdout,
            terminal: false
        });
    
        for await (const line of file) {
            customerIDs.push(line)
        }
        return customerIDs;
    },

    readStatus:() => {
        if (!fs.existsSync(`../${STATUS_FILE_PATH}`)) {
            return {};
        }
        return JSON.parse(fs.readFileSync(`../${STATUS_FILE_PATH}`));
    },

    saveWithWget: async (url, isPdf, id, billMonthIdentifier) => {
        let billMonthFinal = billMonthIdentifier.replace(/\s+/g, '-');
        let date = null;
        if (isPdf) {
           date = parse(billMonthFinal+'Z', 'dd-MMM-yyX', new Date());
        } else {  
           date = parse(billMonthFinal+'Z', 'dd-MM-yyyyX', new Date());
        }

        billMonthFinal = format(date, 'yyyy-MM-dd'); 
        if (!fs.existsSync(`${DOWNLOADS_PATH}/${billMonthFinal}`)) {
            fs.mkdirSync(`${DOWNLOADS_PATH}/${billMonthFinal}`);
        }
       
        Utils.log(url);
        let command = `wget -e robots=off "${url}"`;
    
        if(isPdf) {
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
            await Utils.convertHtmlToPdf(id, billMonthFinal);
        }
        Utils.log('Bill Downloaded');

    },

    saveStatus: (status) => {
        fs.writeFileSync(STATUS_FILE_PATH, JSON.stringify(status, null, 4));
    },

    log: (message) => {
        console.log(`[${format(new Date(), "yyyy-MM-dd kk:mm:ss")}] - ${message}`);
    },

    convertHtmlToPdf:  async (id,  billMonthFinal) => {
        
        await Utils.addHtmlExtension(TMP_DIR);
        await Utils.fixCssForPrinting();
        const pdfPath = `${DOWNLOADS_PATH}/${billMonthFinal}/${id}.pdf`;
        await Utils.printToPdf(pdfPath, TMP_DIR);

        for( let tries = 0;; ++tries) {
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

    printToPdf: async(downloadPath, TMP_DIR) => {
        const chromePath = await Utils.chromeBinary();
        let command = `${chromePath} --headless --print-to-pdf="${downloadPath}" -virtual-time-budget=5000 \`find ${TMP_DIR} -name bill.html\``
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
        const command = `find ${TMP_DIR} -name 'bill.html' -exec sed -i 's/padding-top:\\s*[[:digit:]]\\+mm;/padding-top:12mm;margin-left:12mm;/' {} +`;
        Utils.log(command);
        await execPromise(command);
        const { stdout, stderr } = execPromise(command)
        if (stderr) {
            Utils.log(`error: ${stderr.message}`);
        }
    }

}

export { Utils };
