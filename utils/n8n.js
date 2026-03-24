// utils/n8n.js — S-ONE Bot n8n Webhook Client
const axios = require('axios');
const crypto = require('crypto');

function signPayload(payload, secret) {
  const body = JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function sendToN8n(url, payload) {
  const secret = process.env.N8N_WEBHOOK_SECRET || '';
  const sig = signPayload(payload, secret);
  try {
    const res = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-SONE-Signature': sig,
      },
      timeout: 10000,
    });
    return { ok: true, data: res.data };
  } catch (err) {
    console.error('[n8n] Webhook error:', err.message);
    return { ok: false, error: err.message };
  }
}

// Créer le dossier Drive pour un témoignage
async function createTestimonialFolder(userId, username, guildId, testimonialId) {
  return sendToN8n(process.env.N8N_TESTIMONIAL_CREATE_URL, {
    action: 'create_folder',
    testimonialId,
    userId,
    username,
    guildId,
    timestamp: Date.now(),
  });
}

// Vérifier si une vidéo a été déposée
async function checkTestimonialVideo(userId, guildId, driveFolderId, testimonialId) {
  return sendToN8n(process.env.N8N_TESTIMONIAL_CHECK_URL, {
    action: 'check_video',
    testimonialId,
    userId,
    guildId,
    driveFolderId,
    timestamp: Date.now(),
  });
}

module.exports = { sendToN8n, createTestimonialFolder, checkTestimonialVideo, signPayload };
