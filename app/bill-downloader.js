const Utils = require("./utils");
const fetch = require('node-fetch')
const Cheerio  = require('cheerio')

class BillDownloader {

    async start() {
        Utils.log('Starting checking LESCO bills')
        Utils.log('Verifying directories');
        Utils.setInitialConfig();
        const data = await Utils.readCustomerIds();
        Utils.log(`Customer Ids to check: ${data}`)
        Utils.log("Reading existing Status")
        const existingStatus =  Utils.readStatus();
        console.log(existingStatus)
        const newStatus = {};
    
        for (let id of data) {
            newStatus[id] = await this.processId(id, existingStatus[id]);
        }
    
        Utils.saveStatus(newStatus);
        Utils.log('Exiting now')
    }

    parseCookies(response) {
        const raw = response.headers.raw()['set-cookie'];
        return raw.map((entry) => entry.split(';')[0]).join(';');
    }

    async processId(customerId, existingStatus) {
        Utils.log(`CustomerId: ${customerId}`);
        let response = await fetch('http://www.lesco.gov.pk/Modules/CustomerBill/CheckBill.asp', { method: 'get'});
        const cookies = this.parseCookies(response);
        Utils.log(`Cookies: ${cookies}`);
        const accountStatusUrl = await this.getAccountStatusUrl(cookies, customerId);
        Utils.log(`Opening Account Status: ${accountStatusUrl}`);
        const accountStatus = await this.getAccountStatus(cookies, accountStatusUrl);
        Utils.log(`Account Status: ${JSON.stringify(accountStatus)}`);
    
        if (this.isStatusValid(accountStatus, existingStatus)) {
            Utils.log(`Downloading bill: ${customerId}`);
            await this.downloadBill(cookies, customerId, accountStatus.dueDate);
        } else {
            Utils.log(`New bill not available yet`);
        }

        return accountStatus;
    }

    isStatusValid(status, existingStatus) {
        return (status && status.dueDate && (!existingStatus || status.dueDate != existingStatus.dueDate));
    }
    
    async getAccountStatusUrl(cookies, customerId) {
        const response = await this.postRequest(cookies, customerId, 'btnViewMenu=Customer+Menu');
        const data = await response.text();
        const $ = await Cheerio.load(data)
        return `http://www.lesco.gov.pk${ $('#ContentPane  a:nth-child(1)')[1].attribs['href']}`;
    }
    
    async downloadBill(cookies, customerId, dueDate) {
        const response = await this.postRequest(cookies, customerId, 'btnViewBill=View/Download+Bill');
        const contentType = response.headers.raw()['content-type'][0];
        const isPdf = contentType.includes('pdf'); 
        await Utils.saveWithWget(response.url, isPdf, customerId, dueDate);
    }
    

    async getAccountStatus(cookies, url) {
        const status = { dueDate: '', amount: '', owner: '', paid: false, billMonth: ''};
        
        await fetch(url, {
            method: 'get',
            headers: { cookie: cookies}
        })
        .then(response => response.text())
        .then(async (response) => {
            const $ = Cheerio.load(response)
            const table = $('.MemTab')[0];
            const tbody = table.childNodes.find(x => x.name == 'tbody');
            const rows = tbody.childNodes.filter(x => x.name == 'tr');
            
            status.dueDate = this.getFieldValue(['due date'], rows);
            status.amount = this.getFieldValue(['amount', 'within'], rows);
            status.owner = this.getFieldValue(['customer name'], rows);
            const paymentDate = this.getFieldValue(['payment', 'date'], rows);
            status.paid = paymentDate && paymentDate.trim() && paymentDate.toLowerCase() != 'n/a'
              && paymentDate.toLowerCase() !='na' && !!paymentDate;
            status.billMonth = this.getFieldValue(['bill month'], rows);

        })
        return status;
    }

    getFieldValue(fieldNamesToFind, rows) {
        for(let row of rows) {
            if (row.childNodes) {
                const cells = row.childNodes.filter(c => c.name == 'td');
                const fieldName = this.getInnerValue(cells[0]);
                if (fieldName) {
                    const reducer = (v1, v2) => v1 && v2;
                    const individualResult = fieldNamesToFind.map(toFind => fieldName.toLowerCase().includes(toFind.toLowerCase()));
                    if (individualResult.reduce(reducer)) {
                        return this.getInnerValue(cells[1]);
                    }
                }
            }
        }
        return null;
    }

    async postRequest(cookies, customerId, additionalFormData = '') {
        let data = `txtCustID=${customerId}&${additionalFormData}`;
        let response = null;
        await fetch('http://www.lesco.gov.pk/Modules/CustomerBill/CustomerMenu.asp', {
                method: 'post',
                body: data,
                headers: { cookie: cookies,
                    'accept': '*/*', 'Content-Type': 'application/x-www-form-urlencoded'}
            }).then(async (res) =>  response = res);
        return response;
    }
    
    getInnerValue(node) {
        if (node.childNodes && node.childNodes.length > 0) {
            return this.getInnerValue(node.childNodes[0])
        }
        return node.data;
    } 
}

module.exports = BillDownloader;

