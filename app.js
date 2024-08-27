const express = require('express');
const bodyParser = require('body-parser');
const db = require('./config/database');
const websiteRoutes = require('./routes/websites');
const path = require('path');

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use('/', websiteRoutes);
app.use(express.static(path.join(__dirname, 'public')));


// Checking in every 12 hours
setInterval(() => {
  checkAndUpdateStatus(() => console.log('Periodic check completed.'));
}, 12 * 60 * 60 * 1000);

app.listen(port, () => {
  console.log(`App running at http://localhost:${port}`);
});