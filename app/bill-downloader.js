import { Utils } from './utils.js';
import { Lesco } from './lesco.js';
import { Ptcl } from './ptcl.js';
import { intializeMailerTransport, sendBillEmail } from './mailer.js';

const PTCL = 'ptcl';
const LESCO = 'lesco';
class BillDownloader {
  async start() {
    
    Utils.log('Starting checking bills');

    Utils.log('Verifying directories');
    Utils.setInitialConfig();
    const data = await Utils.readCustomerIds();
    Utils.log('Customer Ids to check');
    Utils.log(data);
    Utils.log('Reading existing Status');
    const existingStatus = Utils.readStatus();
    Utils.log(existingStatus);

    for (const billType of Object.keys(data)) {
      switch (billType) {
      case PTCL:
        try {
          await this.handlePtclBills(data[billType], existingStatus);
        } catch (e) {
          Utils.log('Exception caught while fetching ptcl bill');
          Utils.log(e);
        }
        break;
      case LESCO:
        try {
          await this.handleLescoBills(data[billType], existingStatus);
        } catch (e) {
          Utils.log('Exception caught while fetching lesco bill');
          Utils.log(e);
        }
        break;
      }
    }

    Utils.log('Exiting now');
  }

  async sendEmailWithMailer(toAddress, id, billStatus) {
    if (!this.mailerInitialized) {
      Utils.log('Initializing mail sender');
      await intializeMailerTransport();
      this.mailerInitialized = true;
    }
    await sendBillEmail(toAddress, id, billStatus, billStatus.filePath);
  }

  async handleLescoBills(data, fullStatus) {
    const lescoStatus = { ...fullStatus[LESCO] };
    const lescoDownloader = new Lesco();
    for (const billData of data) {
      const { id } = billData;
      const existingStatus = lescoStatus[id];
      const newStatus = await lescoDownloader.processId(billData, existingStatus);
      lescoStatus[id] = newStatus;
      if (((!existingStatus && newStatus) || (existingStatus.billMonth != newStatus.billMonth)) && billData.email) {
        Utils.log('Going to send email to ', billData.email, 'for bill ', JSON.stringify(newStatus));
        await this.sendEmailWithMailer(billData.email, id, newStatus);
      }
      fullStatus[LESCO] = lescoStatus;
      Utils.saveStatus(fullStatus);
    }
  }

  async handlePtclBills(data, fullStatus) {
    const newStatus = { ...fullStatus[PTCL] };
    const ptclDownloader = new Ptcl();
    for (const billData of data) {
      const id = billData.phone;
      newStatus[id] = await ptclDownloader.processId(billData, newStatus[id]);
      fullStatus[PTCL] = newStatus;
      Utils.saveStatus(fullStatus);
    }
  }
}

export { BillDownloader };
