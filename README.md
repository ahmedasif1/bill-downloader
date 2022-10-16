# LESCO & PTCL Bill Downloader

This project scrapes the website lesco.gov.pk and dbill.ptcl.net.pk to download bills either as pdf for keeping as a record or downloading.

## Dependencies
- wget
- curl
- node.js
- chrome/chromium installed for converting html to PDF

## Configuration
Add the customer ids in the file customer_ids.json. Following will be its format:
```json
{
  "lesco": [
    {"id":"YOUR_ID", "format":"html/pdf", "tag": "TAG"}
  ],
  "ptcl": [
    { "phone": "PHONE_WITHOUT_AREA_CODE", "account_id": "ACCOUNT_ID", "tag":"TAG"}
  ]
}
```
### Running
```bash
node index.js
```
The downloaded bills will be placed in `downloads` folder in the format:
```
downloads:
  - BILL_MONTH (2022-01):
     - TAG (home/office):
        - ID.pdf
        - PTCL_phone_num.pdf

```