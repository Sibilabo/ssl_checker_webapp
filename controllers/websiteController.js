const Website = require('../models/Website');
const { checkSslExpiry } = require('../utils/sslChecker');
const { sendDiscordNotification } = require('./notificationController');

const addWebsite = async (req, res) => {
  const { hostname, port } = req.body;

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
      } else {
        savedSite.daysLeft = `Error: ${err}`;
        savedSite.expiryDate = 'Unknown';
      }
      await savedSite.save();
      res.redirect('/');
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error saving website');
  }
};

const deleteWebsite = async (req, res) => {
  const { id } = req.body;
  try {
    await Website.findByIdAndDelete(id);
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error deleting website');
  }
};

const editWebsite = async (req, res) => {
  const { id } = req.query;
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
};

const updateWebsite = async (req, res) => {
  const { id, hostname, port } = req.body;

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
};

const toggleNotification = async (req, res) => {
  const { id } = req.body;

  try {
    const site = await Website.findById(id);

    if (!site) {
      console.error('Website not found');
      return res.status(404).send('Website not found');
    }

    site.notify = !site.notify;
    await site.save();
    res.redirect('/');
  } catch (err) {
    console.error('Error updating notification status', err);
    res.status(500).send('Error updating notification status');
  }
};

const checkAndUpdateStatus = async (callback) => {
  try {
    const websites = await Website.find({});
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

          resolve();
        });
      });
    }

    if (completedRequests === websites.length) {
      callback();
    }
  } catch (err) {
    console.error('Error checking and updating websites:', err);
    callback();
  }
};

module.exports = {
  addWebsite,
  deleteWebsite,
  editWebsite,
  updateWebsite,
  toggleNotification,
  checkAndUpdateStatus,
};