import nodemailer from 'nodemailer';
import fs from 'fs';
// create reusable transporter object using the default SMTP transport
/**
 * SMTP Config
 * service: 'gmail',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'someone@email.com',
    pass: 'PASSWORD',
  },
 */
let transporter;

export async function intializeMailerTransport() {
  const configFileName = './mailer-config.json';
  const mailerConfig = JSON.parse(fs.readFileSync(configFileName));
  transporter = nodemailer.createTransport(mailerConfig);
}

const sendEmail = async (mailDetails, callback) => {
  try {
    const info = await transporter.sendMail(mailDetails);
    callback(info);
  } catch (error) {
    console.log(error);
  } 
};

export async function sendBillEmail(email, billId, billInfo, attachmentPath) {
  const emailText = `Customer Name:\t${billInfo.owner}\nAccount Id:\t\t${billId}\nBill Month:\t\t${billInfo.billMonth}\nAmount:\t\t\t${billInfo.amount}\nDue Date:\t\t${billInfo.dueDate}\n\nRegards\nBill downloader`;
  const options = {
    from: 'Bill downloader <no-reply@none.com>', // sender address
    to: email, // receiver email
    subject: `New Bill available (${billInfo.billMonth})`,
    text: emailText,
    attachments: [{
      filename: attachmentPath.split('/').pop(),
      path: attachmentPath,
      contentType: 'application/pdf'
    }]
  };
  await sendEmail(options, (info) => {
    console.log('Email sent', JSON.stringify(info));
  });
}
