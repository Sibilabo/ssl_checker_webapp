const mongoose = require('mongoose');

const websiteSchema = new mongoose.Schema({
  hostname: { type: String, required: true },
  port: { type: String, required: true },
  daysLeft: String,
  expiryDate: String,
  notify: { type: Boolean, default: false },
});

module.exports = mongoose.model('Website', websiteSchema);