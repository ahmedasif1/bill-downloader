import { Utils } from "./utils.js";
import { Lesco } from "./lesco.js";
import { Ptcl } from "./ptcl.js";

const PTCL = 'ptcl';
const LESCO = 'lesco';
class BillDownloader {

    async start() {
        Utils.log('Starting checking bills')
        Utils.log('Verifying directories');
        Utils.setInitialConfig();
        const data = await Utils.readCustomerIds();
        Utils.log('Customer Ids to check')
        console.log(data);
        Utils.log("Reading existing Status")
        const existingStatus = Utils.readStatus();
        console.log(existingStatus)

        for(const billType of Object.keys(data)) {
            const newStatus = { ...existingStatus[billType] };

            switch(billType) {
                case PTCL:
                    try {
                        await this.handlePtclBills(data[billType], newStatus)
                    } catch (e) {
                        console.log('Exception caught while fetching lesco bill')
                        console.log(e);
                    }
                    break;
                case LESCO:
                    try {
                        await this.handleLescoBills(data[billType], newStatus);
                    }
                    catch (e) {
                        console.log('Exception caught while fetching ptcl bill')
                        console.log(e);
                    } 
                    break;
            }
        }

        Utils.log('Exiting now')
    }

    async handleLescoBills(data, newStatus) {
        const lescoDownloader = new Lesco();
        for (let billData of data) {
            const id = billData['id'];
            newStatus[id] = await lescoDownloader.processId(billData, newStatus[id]);
            // Utils.saveStatus(newStatus);
        }
    }

    async handlePtclBills(data, newStatus) {
        const ptclDownloader = new Ptcl();
        for (let billData of data) {
            const id = billData['phone'];
            newStatus[id] = await ptclDownloader.processId(billData, newStatus[id]);
            // Utils.saveStatus(newStatus);
        }
    }


}

export { BillDownloader };

