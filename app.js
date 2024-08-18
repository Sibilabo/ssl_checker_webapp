const express = require('express');
const https = require('https');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send(`
    <form action="/check" method="post">
      <label for="hostname">Enter website hostname:</label>
      <input type="text" id="hostname" name="hostname">
      <button type="submit">Check SSL Expiry</button>
    </form>
  `);
});

app.post('/check', (req, res) => {
  const hostname = req.body.hostname;

  function checkSslExpiry(hostname, callback) {
    console.log('Checking SSL expiry for:', hostname);
    const options = {
      hostname: hostname,
      port: 443,
      method: 'GET',
      rejectUnauthorized: false
    };

    const req = https.request(options, (res) => {
      const cert = res.connection.getPeerCertificate();
      console.log('Certificate:', cert);
      if (cert) {
        const expiryDate = new Date(cert.valid_to);
        callback(null, expiryDate.toISOString().replace('T', ' ').substring(0, 19));
      } else {
        callback('No certificate found');
      }
    });

    req.on('error', (e) => {
      console.error(`Request error: ${e.message}`);
      callback(e.message);
    });

    req.end();
  }

  checkSslExpiry(hostname, (err, expiryDate) => {
    if (err) {
      res.send(`Error: ${err}`);
    } else {
      const log1 = res.send(`Certificate for ${hostname} expires on ${expiryDate}`);
      // fs.writeFile('./logs/output_log.txt', `${log1}`, 'utf-8', err => {
      //   console.log('Log saved')
      // } )
    }
  });
});

app.listen(port, () => {
  console.log(`App running at http://localhost:${port}`);
});
