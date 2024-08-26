const express = require('express');
const https = require('https');
const bodyParser = require('body-parser');
const fs = require('fs');
const axios = require('axios');
const { now } = require('moment');
const mongoose = require('mongoose'); //dodanie wpisu o bibliotece

const mongoURI = 'mongodb://localhost:27017/sslchecker';
const app = express();
const port = 3000;

// //Połączenie z MongoDB
// mongoose.connect(mongoURI, {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
// });

// const db = mongoose.connection;
// db.on('error', console.error.bind(console, 'MongoDB connection error: '));
// db.once('open', () => {
//   console.log('Connected to MongoDB')
// });

// //Schemat bazy danych
// const websiteSchema = new mongoose.Schema({
//   hostname: { type: String, required: true },
//   port: { type: String, required: true },
//   daysLeft: String,
//   expiryDate: String,
//   notify: { type: Boolean, default: false },
// });

const Website = mongoose.model('Website', websiteSchema);


// Webhook URL Discorda
const discordWebhookUrl = 'https://discord.com/api/webhooks/1275235088031940639/TeU8KGKXj52Aw_2CDR_ODkiaV-9gfG2NMyIyiwYFt4Jju5njEa4a7gSg7_N8z-XJVloQ';

app.use(bodyParser.urlencoded({ extended: true }));

// Lista stron do sprawdzania
let websites = [];

// Strona główna z formularzem i tabelą
app.get('/', (req, res) => {
  let websiteListHtml = websites.map((site, index) => `
    <tr>
      <td>${site.hostname}</td>
      <td>${site.port}</td>
      <td>${site.daysLeft || 'Unknown'}</td>
      <td>${site.expiryDate || 'Unknown'}</td>
      <td>
        <form action="/delete" method="post" style="display:inline;">
          <input type="hidden" name="index" value="${index}">
          <button type="submit">Usuń</button>
        </form>
        <form action="/edit" method="get" style="display:inline;">
          <input type="hidden" name="index" value="${index}">
          <button type="submit">Edytuj</button>
        </form>
      </td>
      <td>
        <form action="/toggle-notification" method="post">
          <input type="hidden" name="index" value="${index}">
          <input type="checkbox" name="notify" ${site.notify ? 'checked' : ''} onchange="this.form.submit()">
        </form>
      </td>
    </tr>
  `).join('');

  res.send(`
    <form action="/add" method="post">
      <label for="hostname">Enter website hostname:</label>
      <input type="text" id="hostname" name="hostname" required>
      <label for="port">Choose port:</label>
      <select id="port" name="port">
        <option value="443">443</option>
        <option value="80">80</option>
      </select>
      <button type="submit">Add Website</button>
    </form>
    <br>
    <button onclick="window.location.href='/check-now'">Check Now</button>
    <br><br>
    <table border="1">
      <tr>
        <th>Hostname</th>
        <th>Port</th>
        <th>Days Left</th>
        <th>Expiry Date</th>
        <th>Actions</th>
        <th>Notify</th>
      </tr>
      ${websiteListHtml}
    </table>
  `);
});

// Dodawanie nowej strony i natychmiastowe sprawdzenie
app.post('/add', (req, res) => {
  const hostname = req.body.hostname;
  const port = req.body.port;

  const newSite = { hostname, port, daysLeft: 'Checking...', expiryDate: 'Checking...', notify: false };
  websites.push(newSite);

  checkSslExpiry(hostname, port, (err, daysLeft, expiryDate) => {
    if (!err) {
      newSite.daysLeft = daysLeft;
      newSite.expiryDate = expiryDate;
    } else {
      newSite.daysLeft = `Error: ${err}`;
      newSite.expiryDate = 'Unknown';
    }

    res.redirect('/');
  });
});

// Usuwanie strony
app.post('/delete', (req, res) => {
  const index = req.body.index;
  websites.splice(index, 1);
  res.redirect('/');
});

// Edycja strony
app.get('/edit', (req, res) => {
  const index = req.query.index;
  const site = websites[index];
  
  res.send(`
    <form action="/update" method="post">
      <input type="hidden" name="index" value="${index}">
      <label for="hostname">Enter website hostname:</label>
      <input type="text" id="hostname" name="hostname" value="${site.hostname}" required>
      <label for="port">Choose port:</label>
      <select id="port" name="port">
        <option value="443" ${site.port === '443' ? 'selected' : ''}>443</option>
        <option value="80" ${site.port === '80' ? 'selected' : ''}>80</option>
      </select>
      <button type="submit">Update Website</button>
    </form>
  `);
});

// Aktualizacja strony
app.post('/update', (req, res) => {
  const index = req.body.index;
  const hostname = req.body.hostname;
  const port = req.body.port;

  websites[index] = { hostname, port, daysLeft: 'Checking...', expiryDate: 'Checking...', notify: websites[index].notify };

  checkSslExpiry(hostname, port, (err, daysLeft, expiryDate) => {
    if (!err) {
      websites[index].daysLeft = daysLeft;
      websites[index].expiryDate = expiryDate;
    } else {
      websites[index].daysLeft = `Error: ${err}`;
      websites[index].expiryDate = 'Unknown';
    }
    res.redirect('/');
  });
});

// Przełącznik powiadomień
app.post('/toggle-notification', (req, res) => {
  const index = req.body.index;
  websites[index].notify = !websites[index].notify;
  res.redirect('/');
});

// Sprawdzenie certyfikatów i wysłanie powiadomień
app.get('/check-now', (req, res) => {
  checkAndUpdateStatus(() => {
    res.redirect('/');
  });
});

// Funkcja sprawdzania SSL
function checkSslExpiry(hostname, port, callback) {
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
      console.log(`Certyficate found: ${JSON.stringify(cert)}`);
      const expiryDate = new Date(cert.valid_to);
      const daysLeft = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
      callback(null, daysLeft, expiryDate.toISOString().substring(0, 10)); // YYYY-MM-DD
    } else {
      console.log(`No certyficate was found for ${hostname}:${port}`);
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
  })

  req.end();
}

// Funkcja aktualizacji i sprawdzania powiadomień
function checkAndUpdateStatus(callback) {
  let completedRequests = 0;
  websites.forEach((site, index) => {
    checkSslExpiry(site.hostname, site.port, (err, daysLeft, expiryDate) => {
      completedRequests++;
      if (!err) {
        websites[index].daysLeft = daysLeft;
        websites[index].expiryDate = expiryDate;

        if (site.notify && daysLeft <= 30) {
          sendDiscordNotification(site.hostname, daysLeft, expiryDate);
        }
      } else {
        websites[index].daysLeft = `Error: ${err}`;
        websites[index].expiryDate = 'Unknown';
      }

      if (completedRequests === websites.length) {
        callback();
      }
    });
  });
}

// Wysyłanie powiadomienia na Discorda
function sendDiscordNotification(hostname, daysLeft, expiryDate) {
  axios.post(discordWebhookUrl, {
    content: `⚠️ SSL Certificate Alert: The certificate for ${hostname} will expire in ${daysLeft} days (Expiry Date: ${expiryDate}).`
  })
  .then(() => console.log('Notification sent to Discord'))
  .catch(err => console.error('Error sending notification:', err));
}

// Regularna aktualizacja co 12 godzin
setInterval(() => {
  checkAndUpdateStatus(() => console.log('Periodic check completed.'));
}, 12 * 60 * 60 * 1000);

app.listen(port, () => {
  console.log(`App running at http://localhost:${port}`);
});
