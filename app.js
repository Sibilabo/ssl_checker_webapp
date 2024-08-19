const express = require('express');
const https = require('https');
const bodyParser = require('body-parser');
const fs = require('fs');
const axios = require('axios'); // Dodanie axios do wysyłania powiadomień

const app = express();
const port = 3000;

// Zmienna przechowująca webhook URL Discorda
const discordWebhookUrl = 'YOUR_DISCORD_WEBHOOK_URL';

app.use(bodyParser.urlencoded({ extended: true }));

// Lista stron do sprawdzania
let websites = [];

// Strona główna z formularzem
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

  // Natychmiastowe sprawdzenie certyfikatu
  checkSslExpiry(hostname, port, (err, daysLeft, expiryDate) => {
    if (!err) {
      newSite.daysLeft = daysLeft;
      newSite.expiryDate = expiryDate;
    } else {
      newSite.daysLeft = `Error: ${err}`;
      newSite.expiryDate = 'Unknown';
    }

    // Przekierowanie po aktualizacji
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

// Funkcja sprawdzania SSL
function checkSslExpiry(hostname, port, callback) {
  console.log('Checking SSL expiry for:', hostname);
  const options = {
    hostname: hostname,
    port: port,
    method: 'GET',
    rejectUnauthorized: false
  };

  const req = https.request(options, (res) => {
    const cert = res.connection.getPeerCertificate();
    if (cert && cert.valid_to) {
      const expiryDate = new Date(cert.valid_to);
      const daysLeft = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
      callback(null, daysLeft, expiryDate.toISOString().substring(0, 10)); // Zwracamy także datę w formacie YYYY-MM-DD
    } else {
      callback('No certificate found');
    }
  });

  req.on('error', (e) => {
    callback(e.message);
  });

  req.end();
}

// Sprawdzanie i aktualizacja statusu
function checkAndUpdateStatus() {
  websites.forEach((site, index) => {
    checkSslExpiry(site.hostname, site.port, (err, daysLeft, expiryDate) => {
      if (!err) {
        websites[index].daysLeft = daysLeft;
        websites[index].expiryDate = expiryDate;
        // Powiadomienie na Discordzie, jeśli zaznaczono opcję i pozostało mniej niż 30 dni
        if (site.notify && daysLeft <= 30) {
          sendDiscordNotification(site.hostname, daysLeft, expiryDate);
        }
      } else {
        websites[index].daysLeft = `Error: ${err}`;
        websites[index].expiryDate = 'Unknown';
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

// Uruchamiamy aktualizację co 12 godzin
setInterval(checkAndUpdateStatus, 12 * 60 * 60 * 1000);

app.listen(port, () => {
  console.log(`App running at http://localhost:${port}`);
});
