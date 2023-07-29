import { Utils } from './utils.js';
import { Lesco } from './lesco.js';
import { Ptcl } from './ptcl.js';

const PTCL = 'ptcl';
const LESCO = 'lesco';
class BillDownloader {
  async start() {
    Utils.log('Starting checking bills');


    Utils.log('Verifying directories');
    Utils.setInitialConfig();
    const data = await Utils.readCustomerIds();
    Utils.log('Customer Ids to check');
    console.log(data);
    Utils.log('Reading existing Status');
    const existingStatus = Utils.readStatus();
    console.log(existingStatus);

    for (const billType of Object.keys(data)) {
      switch (billType) {
      case PTCL:
        try {
          await this.handlePtclBills(data[billType], existingStatus);
        } catch (e) {
          console.log('Exception caught while fetching ptcl bill');
          console.log(e);
        }
        break;
      case LESCO:
        try {
          await this.handleLescoBills(data[billType], existingStatus);
        } catch (e) {
          console.log('Exception caught while fetching lesco bill');
          console.log(e);
        }
        break;
      }
    }

    Utils.log('Exiting now');
  }

  async handleLescoBills(data, fullStatus) {
    const newStatus = { ...fullStatus[LESCO] };
    const lescoDownloader = new Lesco();
    for (const billData of data) {
      const { id } = billData;
      newStatus[id] = await lescoDownloader.processId(billData, newStatus[id]);
      fullStatus[LESCO] = newStatus;
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
