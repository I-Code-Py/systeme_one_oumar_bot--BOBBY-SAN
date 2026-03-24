// commands/parametres.js — S-ONE Bot /paramètres
const {
  SlashCommandBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, ChannelType
} = require('discord.js');
const { getConfig, setConfig } = require('../utils/database');
const { sone, error, success, footer } = require('../utils/embeds');
const { isBotManager, isHackend, checkLicense, denyInteraction } = require('../utils/guards');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('paramètres')
    .setDescription('⚙️ [BOT MANAGER] Gérer les paramètres du bot S-ONE')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const { valid, config, reason } = checkLicense(interaction.guild.id);
    if (!valid) return denyInteraction(interaction, reason);
    if (!isBotManager(interaction.member, config)) return denyInteraction(interaction, 'Vous devez avoir le rôle **Bot Manager**.');

    await showParamsMenu(interaction, config);
  },
};

async function showParamsMenu(interaction, config) {
  const isOwner = isHackend(interaction.user.id);
  const embed = sone(
    '⚙️ Paramètres S-ONE Bot',
    `Sélectionnez la catégorie à configurer :\n\n` +
    `📊 **Points conférence** : \`${config.pts_conference} pts\`\n` +
    `⏱️ **Points focus** (par 30 min) : \`${config.pts_focus_per_30m} pts\`\n` +
    `🎥 **Points témoignage** : \`${config.pts_testimonial} pts\`\n` +
    `💬 **Points message** : \`${config.pts_text_msg} pts\`\n` +
    `✅ **Seuil présence conférence** : \`${config.conf_attendance_pct}%\`\n` +
    `⏰ **Intervalle focus** : \`${config.focus_interval_min} min\`\n` +
    `🎙️ **Récompenses vocales** : ${config.rewards_vocal ? '✅' : '❌'}\n` +
    `💬 **Récompenses texte** : ${config.rewards_text ? '✅' : '❌'}\n`
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('params_points').setLabel('🎯 Modifier les points').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('params_rewards_toggle').setLabel('🔄 Toggle récompenses').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('params_excluded').setLabel('🚫 Salons exclus').setStyle(ButtonStyle.Secondary),
  );

  const rows = [row1];

  // Option webapp — réservée à Hackend
  if (isOwner) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('params_webapp').setLabel('🌐 Config Webapp (Hackend only)').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('params_banned_campaign').setLabel('🚫 Bannis Témoignage (Hackend only)').setStyle(ButtonStyle.Danger),
      )
    );
  }

  const method = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  await interaction[method]({ embeds: [embed], components: rows, ephemeral: true });
}

// Handler bouton "Modifier les points"
async function handleParamsPoints(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('params_points_modal')
    .setTitle('🎯 Valeurs des points');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('pts_conference').setLabel('Points conférence (≥90%)').setStyle(TextInputStyle.Short).setPlaceholder('10').setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('pts_focus').setLabel('Points focus (par intervalle)').setStyle(TextInputStyle.Short).setPlaceholder('1').setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('pts_testimonial').setLabel('Points témoignage').setStyle(TextInputStyle.Short).setPlaceholder('20').setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('pts_text').setLabel('Points par message').setStyle(TextInputStyle.Short).setPlaceholder('1').setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('conf_pct').setLabel('Seuil présence conférence (%)').setStyle(TextInputStyle.Short).setPlaceholder('90').setRequired(false)
    )
  );

  await interaction.showModal(modal);
}

async function handleParamsPointsModal(interaction) {
  const config = getConfig(interaction.guild.id);
  const parse = (val, fallback) => {
    const n = parseInt(val);
    return isNaN(n) ? fallback : Math.max(0, n);
  };

  const updates = {
    pts_conference: parse(interaction.fields.getTextInputValue('pts_conference'), config.pts_conference),
    pts_focus_per_30m: parse(interaction.fields.getTextInputValue('pts_focus'), config.pts_focus_per_30m),
    pts_testimonial: parse(interaction.fields.getTextInputValue('pts_testimonial'), config.pts_testimonial),
    pts_text_msg: parse(interaction.fields.getTextInputValue('pts_text'), config.pts_text_msg),
    conf_attendance_pct: parse(interaction.fields.getTextInputValue('conf_pct'), config.conf_attendance_pct),
  };

  setConfig(interaction.guild.id, updates);

  await interaction.reply({
    embeds: [success('Paramètres mis à jour', `Les valeurs de points ont été enregistrées.`)],
    ephemeral: true
  });
}

// Toggle récompenses
async function handleRewardsToggle(interaction) {
  await interaction.deferUpdate();
  const config = getConfig(interaction.guild.id);
  setConfig(interaction.guild.id, {
    rewards_vocal: config.rewards_vocal ? 0 : 1,
    rewards_text: config.rewards_text ? 0 : 1,
  });
  const updated = getConfig(interaction.guild.id);
  await interaction.followUp({
    embeds: [success('Toggle récompenses', `Vocal : ${updated.rewards_vocal ? '✅' : '❌'} | Texte : ${updated.rewards_text ? '✅' : '❌'}`)],
    ephemeral: true
  });
}

// Config webapp (Hackend only)
async function handleParamsWebapp(interaction) {
  if (!isHackend(interaction.user.id)) {
    return interaction.reply({ embeds: [error('Accès refusé', 'Cette section est réservée à Hackend.')], ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId('params_webapp_modal')
    .setTitle('🌐 Configuration Webapp');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('webapp_url').setLabel('URL de la webapp / API').setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('webapp_key').setLabel('Clé API webapp').setStyle(TextInputStyle.Short).setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

async function handleWebappModal(interaction) {
  if (!isHackend(interaction.user.id)) return;
  setConfig(interaction.guild.id, {
    webapp_api_url: interaction.fields.getTextInputValue('webapp_url').trim(),
    webapp_api_key: interaction.fields.getTextInputValue('webapp_key').trim(),
  });
  await interaction.reply({ embeds: [success('Webapp configurée', 'La connexion webapp a été enregistrée.')], ephemeral: true });
}

// Salons exclus — select menu
async function handleParamsExcluded(interaction) {
  await interaction.deferUpdate();
  const guild = interaction.guild;
  const textChannels = guild.channels.cache
    .filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice)
    .first(25);

  const config = getConfig(guild.id);
  const excluded = JSON.parse(config.excluded_channels || '[]');

  const options = textChannels.map(c => ({
    label: c.name.substring(0, 25),
    value: c.id,
    default: excluded.includes(c.id),
    description: c.type === ChannelType.GuildVoice ? '🔊 Vocal' : '💬 Texte',
  }));

  if (!options.length) {
    return interaction.followUp({ embeds: [error('Aucun salon', 'Aucun salon disponible.')], ephemeral: true });
  }

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('params_excluded_select')
      .setPlaceholder('Sélectionnez les salons à EXCLURE du calcul')
      .setMinValues(0)
      .setMaxValues(options.length)
      .addOptions(options)
  );

  await interaction.followUp({
    embeds: [sone('🚫 Salons exclus', 'Cochez les salons à exclure du calcul de points. Les sélectionnés seront ignorés.')],
    components: [row],
    ephemeral: true
  });
}

async function handleExcludedSelect(interaction) {
  const selected = interaction.values;
  setConfig(interaction.guild.id, { excluded_channels: JSON.stringify(selected) });
  await interaction.update({
    embeds: [success('Salons exclus mis à jour', `**${selected.length}** salon(s) exclu(s) du calcul de points.`)],
    components: []
  });
}

module.exports.handlers = {
  showParamsMenu,
  handleParamsPoints,
  handleParamsPointsModal,
  handleRewardsToggle,
  handleParamsWebapp,
  handleWebappModal,
  handleParamsExcluded,
  handleExcludedSelect,
};
