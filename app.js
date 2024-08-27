const express = require('express');
const https = require('https');
const bodyParser = require('body-parser');
const fs = require('fs');
const axios = require('axios');
const { now } = require('moment');
const mongoose = require('mongoose');
const { resolve } = require('path');

const mongoURI = 'mongodb://localhost:27017/sslchecker'; //local mongodb
const app = express();
const port = 3000;

//Connecting to MongoDB
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error: '));
db.once('open', () => {
  console.log('Connected to MongoDB')
});

//Database schema
const websiteSchema = new mongoose.Schema({
  hostname: { type: String, required: true },
  port: { type: String, required: true },
  daysLeft: String,
  expiryDate: String,
  notify: { type: Boolean, default: false },
});

const Website = mongoose.model('Website', websiteSchema);


// Discord's webhook
const discordWebhookUrl = 'https://discord.com/api/webhooks/1275235088031940639/TeU8KGKXj52Aw_2CDR_ODkiaV-9gfG2NMyIyiwYFt4Jju5njEa4a7gSg7_N8z-XJVloQ';

app.use(bodyParser.urlencoded({ extended: true }));

// Website's list
let websites = [];

// Main webpage
app.get('/', async (req, res) => {
  try {
    const websites = await Website.find({});
    let websiteListHtml = websites.map((site, id) => `
    <tr>
      <td>${site.hostname}</td>
      <td>${site.port}</td>
      <td>${site.daysLeft || 'Unknown'}</td>
      <td>${site.expiryDate || 'Unknown'}</td>
      <td>
        <form action="/delete" method="post" style="display:inline;">
          <input type="hidden" name="id" value="${site._id}">
          <button type="submit">Delete</button>
        </form>
        <form action="/edit" method="get" style="display:inline;">
          <input type="hidden" name="id" value="${site._id}">
          <button type="submit">Edit</button>
        </form>
      </td>
      <td>
        <form action="/toggle-notification" method="post">
          <input type="hidden" name="id" value="${site._id}">
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
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retreving websites');
  }
});

//ROUTES

app.post('/add', async (req, res) => {
  const hostname = req.body.hostname;
  const port = req.body.port;

  const newSite = new Website({
    hostname,
    port,
    daysLeft: 'Checking...',
    expiryDate: 'Checking...',
    notify: false,
  });
  
  try {
    const savedSite = await newSite.save();
    checkSslExpiry(hostname, port, async (err, daysLeft, expiryDate) => {
      if (!err) {
        savedSite.daysLeft = daysLeft;
        savedSite.expiryDate = expiryDate;
        await savedSite.save();
      } else {
        savedSite.daysLeft = `Error: ${err}`;
        savedSite.expiryDate = 'Unknown';
        await savedSite.save()
      }
      res.redirect('/');
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error saving website');
  }
})


app.post('/delete', async (req, res) => {
  const id = req.body.id;
  try {
    await Website.findByIdAndDelete(id);
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error deleting website');
  }
});


app.get('/edit', async (req, res) => {
  const id = req.query.id;
  try {
    const site = await Website.findById(id);
    res.send(`
      <form action="/update" method="post">
        <input type="hidden" name="id" value="${id}">
        <label for="hostname">Enter website hostname:</label>
        <input type="text" id="hostname" name="hostname" value="${site.hostname}" required>
        <label for="port">Choose port:</label>
        <select id="port" name="port">
          <option value="443" ${site.port === '443' ? 'selected' : ''}>443</option>
          <option value="80" ${site.port === '80' ? 'selected' : ''}>80</option>
        </select>
        <button type="submit">Update Website</button>
      </form>    
    `)
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving website');
  }
});

app.post('/update', async (req, res) => {
  const id = req.body.id;
  const hostname = req.body.hostname;
  const port = req.body.port;

  try {
    const site = await Website.findById(id);
    site.hostname = hostname;
    site.port = port;
    site.daysLeft = 'Checking...';
    site.expiryDate = 'Checking...';
    await site.save();

    checkSslExpiry(hostname, port, async (err, daysLeft, expiryDate) => {
      if (!err) {
        site.daysLeft = daysLeft;
        site.expiryDate = expiryDate;
      } else {
        site.daysLeft = `Error: ${err}`;
        site.expiryDate = 'Unknown';
      }
      await site.save();
      res.redirect('/');
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating website');
  }
});


app.post('/toggle-notification', async (req, res) => {
  const id = req.body.id;

  console.log(req.body.id); // For debugging purposes

  try {
    const site = await Website.findById(id); 

    if (!site) {
      console.error('Website noot found');
      return res.status(404).send('Website not found');
    }

    site.notify = !site.notify;
    await site.save();
    res.redirect('/');
  } catch (err) {
    console.error('Error updateting notification status', err);
    res.status(500).send('Error updating notification status');
  }
});

// Checking SSL certificates and sending notifications
app.get('/check-now', (req, res) => {
  checkAndUpdateStatus(() => {
    res.redirect('/');
  });
});

async function checkAndUpdateStatus(callback) {
  try {
    const websites = await Website.find({}); //Downloading websites from database
    let completedRequests = 0;

    for (const site of websites) {
      await new Promise((resolve) => {
        checkSslExpiry(site.hostname, site.port, async (err, daysLeft, expiryDate) => {
          completedRequests++;
          if (!err) {
            site.daysLeft = daysLeft;
            site.expiryDate = expiryDate;

            if (site.notify && daysLeft <= 30) {
              sendDiscordNotification(site.hostname, daysLeft, expiryDate);
            }
          } else {
            site.daysLeft = `Error: ${err}`;
            site.expiryDate = 'Unknown';
          }
          await site.save();

          resolve(); //Ending of Promise
        });
      });
    }

        if (completedRequests === websites.length) {
          callback();
        }
      } catch (err) {
    console.error('Error checking and updateing websites:', err);
    callback();
  }
}

// SSL checking function
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

// Sending discord notifications
function sendDiscordNotification(hostname, daysLeft, expiryDate) {
  axios.post(discordWebhookUrl, {
    content: `⚠️ SSL Certificate Alert: The certificate for ${hostname} will expire in ${daysLeft} days (Expiry Date: ${expiryDate}).`
  })
  .then(() => console.log('Notification sent to Discord'))
  .catch(err => console.error('Error sending notification:', err));
}

// Checking in every 12 hours
setInterval(() => {
  checkAndUpdateStatus(() => console.log('Periodic check completed.'));
}, 12 * 60 * 60 * 1000);

app.listen(port, () => {
  console.log(`App running at http://localhost:${port}`);
});
