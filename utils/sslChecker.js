const https = require('https');

const checkSslExpiry = (hostname, port, callback) => {
  console.log(`Checking SSL expiry for: ${hostname}:${port}`);
  const options = {
    hostname: hostname,
    port: port,
    method: 'GET',
    rejectUnauthorized: false,
    agent: false,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  };

  const req = https.request(options, (res) => {
    const cert = res.connection.getPeerCertificate();
    if (cert && cert.valid_to) {
      console.log(`Certificate found: ${JSON.stringify(cert)}`);
      const expiryDate = new Date(cert.valid_to);
      const daysLeft = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
      callback(null, daysLeft, expiryDate.toISOString().substring(0, 10)); // YYYY-MM-DD
    } else {
      console.log(`No certificate was found for ${hostname}:${port}`);
      callback('No certificate found');
    }
    res.resume();
  });

  req.on('error', (e) => {
    console.error(`Request error for ${hostname}:${port} - ${e.message}`);
    callback(e.message);
  });

  req.on('close', () => {
    console.log(`Connection closed for ${hostname}:${port}`);
  });

  req.end();
};

module.exports = { checkSslExpiry };