const axios = require('axios');
const discordWebhookUrl = 'https://discord.com/api/webhooks/1275235088031940639/TeU8KGKXj52Aw_2CDR_ODkiaV-9gfG2NMyIyiwYFt4Jju5njEa4a7gSg7_N8z-XJVloQ';

const sendDiscordNotification = (hostname, daysLeft, expiryDate) => {
  axios.post(discordWebhookUrl, {
    content: `⚠️ SSL Certificate Alert: The certificate for ${hostname} will expire in ${daysLeft} days (Expiry Date: ${expiryDate}).`
  })
  .then(() => console.log('Notification sent to Discord'))
  .catch(err => console.error('Error sending notification:', err));
};

module.exports = { sendDiscordNotification };