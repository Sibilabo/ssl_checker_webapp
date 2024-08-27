const express = require('express');
const router = express.Router();
const Website = require('../models/Website');  // Dodaj ten import
const {
  addWebsite,
  deleteWebsite,
  editWebsite,
  updateWebsite,
  toggleNotification,
  checkAndUpdateStatus,
} = require('../controllers/websiteController');

router.get('/', async (req, res) => {
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
    res.status(500).send('Error retrieving websites');
  }
});

router.post('/add', addWebsite);
router.post('/delete', deleteWebsite);
router.get('/edit', editWebsite);
router.post('/update', updateWebsite);
router.post('/toggle-notification', toggleNotification);

router.get('/check-now', (req, res) => {
  checkAndUpdateStatus(() => {
    res.redirect('/');
  });
});

module.exports = router;