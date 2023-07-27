import * as Cheerio from 'cheerio';
import { parse } from 'date-fns';
import fetch, { FormData, Headers } from "node-fetch";
import { Utils } from "./utils.js";


const HIDDEN_FIELDS = {
  __VIEWSTATE: '__VIEWSTATE',
  __VIEWSTATEGENERATOR: '__VIEWSTATEGENERATOR',
  __EVENTVALIDATION: '__EVENTVALIDATION'
};

const BILL_MONTH = '#ctl00_ContentPlaceHolder1_dBill > table > tbody > tr > td:nth-child(2) > table:nth-child(2) > tbody > tr:nth-child(2) > td > div > div:nth-child(2) > table > tbody > tr:nth-child(14) > td:nth-child(3) > span';
const BILL_NAME = '#ctl00_ContentPlaceHolder1_dBill > table > tbody > tr > td:nth-child(2) > table:nth-child(2) > tbody > tr:nth-child(2) > td > div > div:nth-child(2) > table > tbody > tr:nth-child(11) > td:nth-child(2) > div > div:nth-child(2) > table > tbody > tr:nth-child(3) > td:nth-child(2) > span';
const DUE_DATE = '#ctl00_ContentPlaceHolder1_dBill > table > tbody > tr > td:nth-child(2) > table:nth-child(2) > tbody > tr:nth-child(2) > td > div > div:nth-child(2) > table > tbody > tr:nth-child(16) > td:nth-child(3) > span';
const AMOUNT = '#ctl00_ContentPlaceHolder1_dBill > table > tbody > tr > td:nth-child(2) > table:nth-child(2) > tbody > tr:nth-child(2) > td > div > div:nth-child(2) > table > tbody > tr:nth-child(17) > td:nth-child(3) > span';
const BILL_PDF_ID = 'ctl00_ContentPlaceHolder1_hplPrintBill';

class Ptcl {
  async processId(data, status) {
    await this.openRequestPage();
    this.billData = data;
    let response = await this.submitForm(data);
    const { billUrl, details } = await this.followRedirect(response);
    Utils.log(`Account Status: ${JSON.stringify(details)}`);

    if (status?.['billMonth'] && details['billMonth'] === status['billMonth']) {
      Utils.log('New bill does not exist');
    } else {
      await this.downloadPdf(billUrl, details);
    }
    
    return details;
  }

  async openRequestPage() {
    let response = await fetch('https://dbill.ptcl.net.pk/PTCLSearchInvoice.aspx', { method: 'get' });
    await this.readHiddenFields(response);
    this.cookies = Utils.parseCookies(response);
  }

  async submitForm() {
    const formData = new FormData();
    for (const field in this.hiddenFields) {
      formData.append(field, this.hiddenFields[field]);
    }

    formData.append('ctl00$ContentPlaceHolder1$txtPhoneNo', this.billData['phone']);
    formData.append('ctl00$ContentPlaceHolder1$txtAccountID', this.billData['account_id']);
    formData.append('ctl00$ContentPlaceHolder1$btnSearch', 'Search');

    return fetch('https://dbill.ptcl.net.pk/PTCLSearchInvoice.aspx', { method: 'post', body: formData, redirect: 'manual'});
  }

  async followRedirect(response) {
    this.cookies = Utils.parseCookies(response);
    const newLocation = `https://dbill.ptcl.net.pk${response.headers.raw()['location']}`;
    const headers = new Headers();
    headers.append('Cookie', this.cookies);
    headers.append('Host', 'dbill.ptcl.net.pk');
    headers.append('Accept', '*/*');
    const billResponse = await fetch(newLocation, { headers: headers });
    return this.getBillDetail(await billResponse.text());
  }

  getBillDetail(htmlText) {
    const $ = Cheerio.load(htmlText);
    const details = {
      dueDate: $(`${DUE_DATE}`).text(),
      name: $(`${BILL_NAME}`).text(),
      amount: $(`${AMOUNT}`).text(),
      billMonth: $(`${BILL_MONTH}`).text()
    }
    let billUrl = $(`#${BILL_PDF_ID}`)[0].attribs.href;
    billUrl = `https://dbill.ptcl.net.pk/${billUrl}`;
    return {
      details,
      billUrl
    }
  }

  async downloadPdf(downloadUrl, accountStatus) {
    Utils.log('Downloading bill for phone:', this.billData['phone']);
    const parsedBillMonth = parse(`10-${accountStatus.billMonth}`, 'dd-MMM. yyyy', new Date());
    return Utils.downloadWithCurl(downloadUrl, this.cookies, this.billData, parsedBillMonth, `PTCL-${this.billData['phone']}.pdf`)
  }

  async readHiddenFields(response) {
    const data = await response.text();
    const $ = Cheerio.load(data);
    const fields = {}
    for (let id of Object.keys(HIDDEN_FIELDS)) {
      fields[id] = $(`#${id}`)[0].attribs.value;
    }
    this.hiddenFields = fields;
  }
}
export { Ptcl }