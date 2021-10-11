const fs = require('fs');
const readline = require('readline');
const { execSync, exec } = require("child_process");
const { format } = require('date-fns');
const DOWNLOADS_PATH = 'downloads';
const DATA_PATH = 'data';
const STATUS_FILE_PATH =  `${DATA_PATH}/status.json`;
const tempDir = 'tmp';

const Utils = {

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

    readStatus: () => {
        return require(`../${STATUS_FILE_PATH}`);
    },

    saveWithWget: async (url, isPdf, id, billMonthIdentifier) => {
        const billMonthFinal = billMonthIdentifier.replace(/\s+/g, '-');
       
        if (!fs.existsSync(`${DOWNLOADS_PATH}/${billMonthFinal}`)) {
            fs.mkdirSync(`${DOWNLOADS_PATH}/${billMonthFinal}`);
        }
       
        Utils.log(url);
        let command = `wget -e robots=off "${url}"`;
    
        if(isPdf) {
            command = `cd ${DOWNLOADS_PATH}/${billMonthFinal} && ${command} -O ${id}.pdf`
        } else {
            command = `mkdir -p ${tempDir} && cd ${tempDir} && rm -rf * && ${command} -p -k -r -l 1 -R *.js`
        }
        Utils.log(command);
        await exec(command, (error, stdout, stderr) => {
            if (error) {
                Utils.log(`error: ${error.message}`);
                return;
            } else if (!isPdf) {
              Utils.convertHtmlToPdf(id, billMonthFinal);
            }
            Utils.log('Bill Downloaded');

        });
    },

    saveStatus: (status) => {
        fs.writeFileSync(STATUS_FILE_PATH, JSON.stringify(status, null, 4));
    },

    log: (message) => {
        console.log(`[${format(new Date(), "yyyy-MM-dd kk:mm:ss")}] - ${message}`);
    },

    convertHtmlToPdf:  (id,  billMonthFinal) => {
        
        Utils.addHtmlExtension(tempDir);
        Utils.fixCssForPrinting();
        
        const command = `chromium --headless --print-to-pdf="${DOWNLOADS_PATH}/${billMonthFinal}/${id}.pdf" -virtual-time-budget=2000 \`find ${tempDir} -name bill.html\``
        Utils.log(command);
        execSync(command, (error, stdout, stderr) => {
            if (error) {
                Utils.log(`error: ${error.message}`);
            }
        });
    },

    addHtmlExtension: (path) => {
      const command = `find ${path} -name '*asp*' ! -name '*html' -execdir mv {} bill.html \\;`;
      Utils.log(command);
      execSync(command, (error, stdout, stderr) => {
          if (error) {
              Utils.log(`error: ${error.message}`);
          }
      });
    },

    fixCssForPrinting: () => {
        const command = `find ${tempDir} -name 'bill.html' -exec sed -i 's/padding-top:\\s*[[:digit:]]\\+mm;/padding-top:12mm;margin-left:12mm;/' {} +`;
        Utils.log(command);
        execSync(command, (error, stdout, stderr) => {
            if (error) {
                Utils.log(`error: ${error.message}`);
            }
        });
    }

}

module.exports = Utils;
