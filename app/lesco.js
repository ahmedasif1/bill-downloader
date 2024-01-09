import { Utils } from './utils.js';
import fetch from 'node-fetch';
import * as Cheerio from 'cheerio';
import { format, parse } from 'date-fns';
import { Buffer } from 'buffer';

const BILL_DOWNLOAD_PATH = 'http://www.lesco.gov.pk:36247/BillNew.aspx';
const BILL_DOWNLOAD_PATH_MDI = 'http://www.lesco.gov.pk:36247/BillNewMDI.aspx';
const CHECK_BILL_PATH = 'http://www.lesco.gov.pk/Modules/CustomerBill/CheckBill.asp';
class Lesco {
  lescoHostUrl = '';
  billIdentifier = null;
  async processId(billData, existingStatus) {
    const customerId = billData['id'];
    Utils.log(`CustomerId: ${customerId}`);
    let response = await fetch(CHECK_BILL_PATH, { method: 'get' });
    const cookies = Utils.parseCookies(response);
    this.lescoHostUrl = new URL(response.url).host;
    Utils.log(`Cookies: ${cookies}`);
    const accountStatusUrlInfo = await this.getAccountStatusUrl(cookies, customerId);
    Utils.log(`Opening Account Status: ${JSON.stringify(accountStatusUrlInfo)}`);
    let accountStatus = await this.getAccountStatus(cookies, accountStatusUrlInfo);
    Utils.log(`Account Status: ${JSON.stringify(accountStatus)}`);
    this.billIdentifier = accountStatusUrlInfo.formDataMap;
    if (this.isStatusValid(accountStatus, existingStatus)) {
      Utils.log(`Downloading bill: ${customerId}`);
      try {
        const filePath = await this.downloadBill(cookies, billData, accountStatus.billMonth);
        accountStatus.filePath = filePath;
      } catch (error) {
        Utils.log('Exception ', error);
        accountStatus = existingStatus;
      }
    } else {
      Utils.log('New bill not available yet');
    }

    return accountStatus;
  }

  isStatusValid(status, existingStatus) {
    return (status?.dueDate && (!existingStatus || status.dueDate != existingStatus.dueDate));
  }

  async getAccountStatusUrl(cookies, customerId) {
    const response = await this.postRequest(cookies, customerId, 'btnViewMenu=Customer+Menu');
    const data = await response.text();
    const $ = Cheerio.load(data);
    const formDataMap = {};
    Object.values($('form.inline:nth-child(9) > input')).map(x=> x.attribs).filter(x=>x).forEach((x) => { formDataMap[x.name] = x.value; });
    return {
      url: $('form.inline:nth-child(9)')[0].attribs.action,
      formDataMap: formDataMap
    };
  }


  async downloadIncludedFiles(responseContent, currentPath, cookies) {
    const $ = Cheerio.load(responseContent);
    // css files
    let filesToDownload = [...$('link').toArray().filter(link => link.attribs.rel ==='stylesheet').map(link => link.attribs.href)];
    
    //image files
    filesToDownload = [...filesToDownload, ...$('img').toArray().map(img => img.attribs.src)];
    filesToDownload = [...filesToDownload, ...$('script').toArray().filter(x=>x.attribs.src).map(x=>x.attribs.src)];
    filesToDownload = filesToDownload.filter(file => !file.startsWith('http'));
    for (let _file of filesToDownload) {
      const file = _file.replace('./', '').replace(/^\//, '');
      Utils.log('Downloading URL: ', `${currentPath}/${file}`);
      const response = await fetch(`${currentPath}/${file}`,{ method: 'get', headers: { cookie: cookies } });
      let responseData = null;
      if (response.headers.get('Content-Type').includes('text')) {
        responseData = await response.text();
      } else {
        responseData = Buffer.from(await response.arrayBuffer());
      }
      Utils.writeTmpFile(responseData, file.startsWith('ChartImg') ? 'ChartImg.png' : file);
    }
  }

  async downloadBill(cookies, billData, billMonth) {
    await Utils.emptyTmpFolder();
    function renameKeys(obj) {
      const entries = Object.keys(obj).map(key => {
        const newKey = key.replace(/^str/, '').replace(/^n/,'');
        return {[newKey]: obj[key]};
      });
      return Object.assign({}, ...entries);
    }
    const url = billData.format === 'pdf' ? BILL_DOWNLOAD_PATH : BILL_DOWNLOAD_PATH_MDI;
    const formDataMap = renameKeys(this.billIdentifier);
    const response = await fetch(url, {
      method: 'post',
      headers: { cookie: cookies },
      body: Utils.mapToFormData(formDataMap)
    });
    const responseText = await response.text();
    Utils.writeTmpFile(responseText, 'bill.html');

    const responseCookies = Utils.parseCookies(response);

    const parsedUrl = new URL(url);
    await this.downloadIncludedFiles(responseText, `${parsedUrl.origin}${parsedUrl.pathname.split('/').slice(0, -1)}`, responseCookies);
    const billMonthParsed = this.parseBillMonth(billMonth);
    const downloadPath = Utils.getAndCreateDownloadsPath(billData, billMonthParsed);
    await Utils.convertHtmlToPdf(billData, downloadPath, billMonthParsed);
    return `${downloadPath}/${billData['id']}_${format(billMonthParsed, 'yyyy-MM')}.pdf`;
  }

  parseBillMonth(billMonth) {
    Utils.log('Bill Month: ', billMonth);
    let billMonthFinal = billMonth.replace(/\s+/g, '-');

    let date = null;
    let dateFormats = ['dd-MM-yyyy', 'dd-LLL-yy'];

    Utils.log(`Parsing date 10-${billMonthFinal} with format ${dateFormats[0]}`);
    date = parse(`10-${billMonthFinal}`, dateFormats[0], new Date());
    if (date == 'Invalid Date') {
      Utils.log(`Parsing date 10-${billMonthFinal} with format ${dateFormats[1]}`);
      date = parse(`10-${billMonthFinal}`, dateFormats[1], new Date());
    }
    return date;
  }


  async getAccountStatus(cookies, url) {
    const status = { dueDate: '', amount: '', owner: '', paid: false, billMonth: '' };
    await fetch(url.url, {
      method: 'post',
      headers: { cookie: cookies },
      body: Utils.mapToFormData(url.formDataMap)
    })
      .then(response => response.text())
      .then(async (response) => {
        const $ = Cheerio.load(response);
        const table = $('.MemTab')[0];
        const tbody = table.childNodes.find(x => x.name == 'tbody');
        const rows = tbody.childNodes.filter(x => x.name == 'tr');

        status.dueDate = this.getFieldValue(['due date'], rows);
        status.amount = this.getFieldValue(['amount', 'within'], rows);
        status.owner = this.getFieldValue(['customer name'], rows);
        const paymentDate = this.getFieldValue(['payment', 'date'], rows);
        status.paid = paymentDate?.trim() && paymentDate.toLowerCase() != 'n/a'
          && paymentDate.toLowerCase() != 'na' && !!paymentDate;
        status.billMonth = this.getFieldValue(['bill month'], rows);

      });
    return status;
  }

  getFieldValue(fieldNamesToFind, rows) {
    for (let row of rows) {
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
    await fetch(`http://${this.lescoHostUrl}/Modules/CustomerBill/CustomerMenu.asp`, {
      method: 'post',
      body: data,
      headers: {
        cookie: cookies,
        'accept': '*/*', 'Content-Type': 'application/x-www-form-urlencoded'
      }
    }).then(async (res) => response = res);
    return response;
  }

  getInnerValue(node) {
    if (node.childNodes && node.childNodes.length > 0) {
      return this.getInnerValue(node.childNodes[0]);
    }
    return node.data;
  }
}
export { Lesco };