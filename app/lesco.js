import { Utils } from './utils.js';
import fetch from 'node-fetch';
import * as Cheerio from 'cheerio';
import { format, parse } from 'date-fns';
import { Buffer } from 'buffer';

const BILL_DOWNLOAD_PATH = 'http://www.lesco.gov.pk:36247/Bill.aspx';
const BILL_DOWNLOAD_PATH_MDI = 'http://www.lesco.gov.pk:36247/BillNewMDI.aspx';
const CHECK_BILL_PATH = 'http://www.lesco.gov.pk/Modules/CustomerBillN/CheckBill.asp';
const STATIC_CAPTCHA = '1234';

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
    console.log(accountStatusUrlInfo);
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

  async generateCaptcha(cookies) {
    const captchaUrl = `http://${this.lescoHostUrl}/Web/GenerateCaptcha.aspx?code=${STATIC_CAPTCHA}&Usecode=1`;
    console.log(captchaUrl);
    await fetch(captchaUrl, { method: 'get', headers: { cookie: cookies }}).then();
  }
  
  async getAccountStatusUrl(cookies, customerId) {
    const response = await this.postRequest(cookies, customerId, 'btnViewMenu=Customer+Menu');
    const data = await response.text();
    const $ = Cheerio.load(data);
    await this.generateCaptcha(cookies);
    const formDataMap = {};
    const forms = $('.checkbill_table form.inline')
    // for (const form of forms) {
    //   // console.log('form', form);
    //   console.log(form.attribs.action.includes('AccountStatus'));
    //   console.log('formended awdawdwad');
    // }
    // console.log(forms.map(x => x.name));
    Object.values($('.checkbill_table form.inline > input')).map(x=> x.attribs).filter(x => x).forEach((x) => { formDataMap[x.name] = x.value; });
    Object.values($('.checkbill_table form.inline > button')).map(x=> x.attribs).filter(x => x).forEach((x) => { formDataMap[x.name] = x.value; });

    return {
      url: 'http://www.lesco.gov.pk:36269/Modules/CustomerBillN/AccountStatus.aspx',
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
    formDataMap['CapCode'] = STATIC_CAPTCHA;
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
        const container = $('.AccountStatus')[0];
        const rows = container.childNodes.filter(x => x.name == 'div' && x.attribs.class?.includes('row')).flat();
        const columns = rows.map(row => ([...row.childNodes])).flat().filter(x => x.attribs?.class?.includes('col'))
        status.dueDate = this.getFieldValue('Due Date:', columns);
        status.amount = this.getFieldValue('Amount Payable Within Due Date:', columns);
        status.owner = this.getFieldValue('Customer Name:', columns);
        const paymentDate = this.getFieldValue('Payment Date:', columns);
        status.paid = paymentDate?.trim() && paymentDate.toLowerCase() != 'n/a'
          && paymentDate.toLowerCase() != 'na' && !!paymentDate;
        status.billMonth = this.getFieldValue('Last Bill Month:', columns);

      });
    return status;
  }

  getFieldValue(fieldNamesToFind, rows) {
    for (let row of rows) {
      if (row.childNodes) {
        const heading = row.childNodes.filter(c => c.name == 'h5')[0];
        const headingName = heading?.children?.[0]?.data;
        if (headingName === fieldNamesToFind) {
          console.log(fieldNamesToFind);
          const valueField = row.children.filter(x => x.name =='strong')[0];
          console.log(valueField);
          return valueField.children[0].data 
        }
      }
    }
    return null;
  }

  async postRequest(cookies, customerId, additionalFormData = '') {
    let data = `txtCustID=${customerId}&${additionalFormData}`;
    let response = null;
    await fetch(`http://${this.lescoHostUrl}/Modules/CustomerBillN/CustomerMenu.asp`, {
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