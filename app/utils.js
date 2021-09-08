const fs = require('fs');
const readline = require('readline');
const { exec } = require("child_process");
const { format } = require('date-fns');
const DOWNLOADS_PATH = 'downloads';
const DATA_PATH = 'data';
const STATUS_FILE_PATH =  `${DATA_PATH}/status.json`;

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
            command += ` -O ${id}.pdf`
        } else {
            command = `mkdir -p ${id} && cd ${id} && ${command} -p -k -r -l 1 -R *.js`
        }
        Utils.log(command);
        exec(`cd ${DOWNLOADS_PATH}/${billMonthFinal} && ` + command, (error, stdout, stderr) => {
            if (error) {
                Utils.log(`error: ${error.message}`);
                return;
            }

            Utils.log('Bill Downloaded');
        });
    },

    saveStatus: (status) => {
        fs.writeFileSync(STATUS_FILE_PATH, JSON.stringify(status, null, 4));
    },

    log: (message) => {
        console.log(`[${format(new Date(), "yyyy-MM-dd kk:mm:ss")}] - ${message}`);
    }
}

module.exports = Utils;