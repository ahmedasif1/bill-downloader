const fs = require('fs');
const readline = require('readline');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { exit } = require('process');

customerIDs = [];

const readBillIds = async () => {
    customerIDs = [];

    const file = readline.createInterface({
        input: fs.createReadStream('customer_ids.txt'),
        output: process.stdout,
        terminal: false
    });

    for await (const line of file) {
        customerIDs.push(line)
    }
    return customerIDs;
}


const testing = new Promise(async (resolve, reject) => {
    const data = await readBillIds();
    console.log(data);
    await [customerIDs[0]].forEach(async (id) => {
        await fetch('http://www.lesco.gov.pk/Modules/CustomerBill/CheckBill.asp', {
            method: 'get',
        }).then(async (response) => { 
            await postRequest(response, id);
        })
    });
})

const postRequest = async (firstResponse, id, downloadBill = false, cookies = null) => {
    cookies = cookies || parseCookies(firstResponse);
    console.log(cookies)
    console.log(id);
    let data = `txtCustID=${id}&`;

    if (downloadBill) {
        data += 'btnViewBill=View/Download+Bill';
    } else {
        data += 'btnViewMenu=Customer+Menu';
    }

    await fetch('http://www.lesco.gov.pk/Modules/CustomerBill/CustomerMenu.asp', {
            method: 'post',
            body: data,
            headers: { cookie: cookies,
                'accept': '*/*', 'Content-Type': 'application/x-www-form-urlencoded'}
        }).then(response => downloadBill ? response : response.text())
        .then(async (response) => {
            if (downloadBill) {
                const contentType = response.headers.raw()['content-type'][0];
                if (contentType.includes('pdf')) {
                    console.log('saving pdf');
                } else {
                    // saving HTML
                }
            } else {
                const $ = cheerio.load(response)
                const url = `http://www.lesco.gov.pk/Modules/CustomerBill/${$('a[href^="AccountStatus"]')['0'].attribs['href']}`;
                const date = await openAccountStatus(cookies, url);
            }
        })
    if (!downloadBill) {
        await postRequest(null, id, true, cookies);
    }
}

function getInnerValue(node) {
    if (node.childNodes && node.childNodes.length > 0) {
        return getInnerValue(node.childNodes[0])
    }
    return node.data;
}

const openAccountStatus = async (cookies, url) => {
    let dueDate = null;
    
    await fetch(url, {
        method: 'get',
        headers: { cookie: cookies}
    })
    .then(response => response.text())
    .then(async (response) => {
        const $ = cheerio.load(response)
        const table = $('.MemTab')[0];
        const tbody = table.childNodes.find(x => x.name == 'tbody');
        tbody.childNodes.filter(x => x.name == 'tr').forEach(row => {
            if (row.childNodes) {
                cells = row.childNodes.filter(c => c.name == 'td');
                const value = getInnerValue(cells[0]);
                if (value && value.toLowerCase() === 'due date') {
                    if (cells[1]) {
                        dueDate = getInnerValue(cells[1]);
                        console.log(dueDate);
                    }
                }
            }
            
        })
    })
    return dueDate;
}

const downloadBill = (response) => {
    
}


function parseCookies(response) {
  const raw = response.headers.raw()['set-cookie'];
  return raw.map((entry) => {
    const parts = entry.split(';');
    const cookiePart = parts[0];
    return cookiePart;
  }).join(';');
}


testing.then();
