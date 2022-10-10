# LESCO Bill Downloader

This project scrapes the website lesco.gov.pk to download bills either as pdf or html page (Whichever is available)

## Dependencies
- wget
- node.js
- chrome/chromium installed for converting html to PDF

## Configuration
Add the customer ids in the file customer_ids.json. Following will be its format:
```json
[
 {"id":YOUR_ID, format:"html/pdf"}
]
```
### Running
```bash
node index.js
```
The downloaded bills will be placed in `downloads` folder.