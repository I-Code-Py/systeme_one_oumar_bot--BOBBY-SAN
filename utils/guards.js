// utils/guards.js — S-ONE Bot Permission Guards
const { getConfig } = require('./database');

const HACKEND_ID = process.env.HACKEND_USER_ID || '1223607698113695836';

function isHackend(userId) {
  return userId === HACKEND_ID;
}

function isAdmin(member) {
  return member.permissions.has('Administrator') || isHackend(member.user.id);
}

function isBotManager(member, config) {
  if (!config?.role_botmanager_id) return isAdmin(member);
  return member.roles.cache.has(config.role_botmanager_id) || isAdmin(member);
}

function isCoach(member, config) {
  if (!config?.role_coach_id) return false;
  return member.roles.cache.has(config.role_coach_id) || isAdmin(member);
}

function isStudent(member, config) {
  if (!config?.role_student_id) return false;
  return member.roles.cache.has(config.role_student_id);
}

function checkLicense(guildId) {
  const config = getConfig(guildId);
  if (!config) return { valid: false, reason: 'Bot non configuré. Lancez `/setup`.' };
  if (!config.license_active) return { valid: false, reason: 'Licence suspendue. Contactez Hackend - Systeme.one.' };
  if (!config.setup_done) return { valid: false, reason: 'Configuration incomplète. Lancez `/setup`.' };
  return { valid: true, config };
}

// Réponse d'erreur standard pour interaction
async function denyInteraction(interaction, reason) {
  const { error } = require('./embeds');
  const method = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
  await interaction[method]({
    embeds: [error('Accès refusé', reason)],
    ephemeral: true
  });
}

module.exports = { isHackend, isAdmin, isBotManager, isCoach, isStudent, checkLicense, denyInteraction, HACKEND_ID };
