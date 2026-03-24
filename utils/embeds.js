// utils/embeds.js — S-ONE Bot Embed Factory
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const BRAND_COLOR = 0x6C5CE7;       // violet S-ONE
const SUCCESS_COLOR = 0x00B894;
const ERROR_COLOR = 0xFF6B6B;
const WARNING_COLOR = 0xFDCB6E;
const INFO_COLOR = 0x74B9FF;
const FOOTER_TEXT = '⚡ Designed by Hackend — Systeme.one';

function footer() {
  return { text: FOOTER_TEXT };
}

function base(title, description, color = BRAND_COLOR) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter(footer())
    .setTimestamp();
}

function success(title, description) {
  return base(`✅ ${title}`, description, SUCCESS_COLOR);
}

function error(title, description) {
  return base(`❌ ${title}`, description, ERROR_COLOR);
}

function warning(title, description) {
  return base(`⚠️ ${title}`, description, WARNING_COLOR);
}

function info(title, description) {
  return base(`ℹ️ ${title}`, description, INFO_COLOR);
}

function sone(title, description) {
  return base(title, description, BRAND_COLOR);
}

// Embed dashboard leaderboard
function leaderboard(rows, guildName) {
  const lines = rows.map((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
    return `${medal} <@${r.user_id}> — \`${r.points} pts\``;
  });
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('🏆 Classement S-ONE')
    .setDescription(lines.length ? lines.join('\n') : '*Aucun membre classé pour l\'instant.*')
    .setFooter(footer())
    .setTimestamp()
    .addFields({ name: '📍 Serveur', value: guildName, inline: true });
}

// Embed profil membre (admin)
function memberProfile(member, user, history, purchases) {
  const histLines = history.map(h => {
    const sign = h.delta > 0 ? `+${h.delta}` : `${h.delta}`;
    const date = new Date(h.created_at * 1000).toLocaleDateString('fr-FR');
    return `\`${date}\` ${sign} pts — ${h.reason}`;
  }).join('\n') || '*Aucun historique*';

  const purchaseLines = purchases.length
    ? purchases.map(p => `• ${p.product} (${p.amount}€)`).join('\n')
    : '*Aucun achat enregistré*';

  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle(`👤 Profil — ${user.username}`)
    .setThumbnail(user.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: '🆔 ID', value: user.id, inline: true },
      { name: '📧 Email', value: member.email || '*non renseigné*', inline: true },
      { name: '💰 Points', value: `\`${member.points} pts\``, inline: true },
      { name: '⏳ Points en attente', value: `\`${member.points_pending} pts\``, inline: true },
      { name: '🔒 Récompenses bloquées', value: member.rewards_blocked ? '**Oui**' : 'Non', inline: true },
      { name: '🎥 Témoignage banni', value: member.testimonial_banned ? '**Oui**' : 'Non', inline: true },
      { name: '🛒 Achats webapp', value: purchaseLines },
      { name: '📜 Historique des points (10 derniers)', value: histLines },
      { name: '📝 Notes', value: member.notes || '*Aucune note*' },
    )
    .setFooter(footer())
    .setTimestamp();
}

// Boutons action profil
function profileButtons(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`profile_prison_${userId}`).setLabel('🔒 Prison').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`profile_addpts_${userId}`).setLabel('➕ Points').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`profile_rmvpts_${userId}`).setLabel('➖ Points').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`profile_block_${userId}`).setLabel('🚫 Bloquer récomp.').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`profile_note_${userId}`).setLabel('📝 Note').setStyle(ButtonStyle.Primary),
  );
}

// Embed témoignage (DM utilisateur)
function testimonialDM(driveFolderUrl, testimonialId) {
  return {
    embed: new EmbedBuilder()
      .setColor(BRAND_COLOR)
      .setTitle('🎥 Dépôt de Témoignage')
      .setDescription(
        `Un dossier a été créé pour toi sur Google Drive.\n\n` +
        `**1.** Dépose ta vidéo dans le dossier ci-dessous\n` +
        `**2.** Clique sur **"Vidéo déposée ✅"** une fois le dépôt effectué\n\n` +
        `> 📁 [Accéder au dossier Drive](${driveFolderUrl})\n\n` +
        `*Tu as un délai de **10 secondes** entre chaque clic sur le bouton.*`
      )
      .setFooter(footer())
      .setTimestamp(),
    row: new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`testimonial_submitted_${testimonialId}`)
        .setLabel('Vidéo déposée ✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`testimonial_cancel_${testimonialId}`)
        .setLabel('Annuler ❌')
        .setStyle(ButtonStyle.Secondary),
    )
  };
}

// Embed notification modérateur témoignage
function testimonialModNotif(userId, testimonialId, guildId) {
  return {
    embed: new EmbedBuilder()
      .setColor(WARNING_COLOR)
      .setTitle('📹 Nouveau Témoignage à valider')
      .setDescription(
        `<@${userId}> a soumis une vidéo témoignage.\n\n` +
        `**ID Demande :** \`${testimonialId}\`\n` +
        `Vérifiez le dossier Drive puis approuvez ou refusez.`
      )
      .setFooter(footer())
      .setTimestamp(),
    row: new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`tmod_approve_${testimonialId}`)
        .setLabel('✅ Approuver (+pts)')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`tmod_reject_${testimonialId}`)
        .setLabel('❌ Refuser')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`tmod_ban_${testimonialId}`)
        .setLabel('🚫 Bannir témoignage')
        .setStyle(ButtonStyle.Danger),
    )
  };
}

module.exports = {
  BRAND_COLOR, SUCCESS_COLOR, ERROR_COLOR, WARNING_COLOR, INFO_COLOR,
  footer, base, success, error, warning, info, sone,
  leaderboard, memberProfile, profileButtons,
  testimonialDM, testimonialModNotif,
};
