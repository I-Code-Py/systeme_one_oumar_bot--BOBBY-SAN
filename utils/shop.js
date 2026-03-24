// commands/shop.js — S-ONE Bot /shop
// Designed by Hackend — Systeme.one
const {
  SlashCommandBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType
} = require('discord.js');
const {
  getConfig, setConfig,
  getMember, ensureMember, addPoints,
  getShopProducts, getShopProduct, createShopProduct, updateShopProduct, deleteShopProduct, decrementStock,
  createOrder, getOrder, updateOrder, getUserOrders, getPendingOrders,
  db
} = require('../utils/database');
const { error, success, warning, sone, footer } = require('../utils/embeds');
const { checkLicense, isAdmin, isBotManager, denyInteraction } = require('../utils/guards');
const axios = require('axios');

const ITEMS_PER_PAGE = 1; // 1 produit par page = embed riche avec image

// ═══════════════════════════════════════════════════════════════════════════════
// COMMANDE /shop
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('🛒 Boutique — Échangez vos points contre des récompenses'),

  async execute(interaction) {
    const { valid, config, reason } = checkLicense(interaction.guild.id);
    if (!valid) return denyInteraction(interaction, reason);

    ensureMember(interaction.guild.id, interaction.user.id, interaction.user.username);
    await showShopPage(interaction, interaction.guild.id, 0, false);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// AFFICHAGE D'UNE PAGE DU SHOP
// ═══════════════════════════════════════════════════════════════════════════════

async function showShopPage(interaction, guildId, page, isUpdate = true) {
  const config = getConfig(guildId);
  const products = getShopProducts(guildId);
  const member = getMember(guildId, interaction.user.id);

  // Shop vide
  if (!products.length) {
    const embed = sone('🛒 Boutique S-ONE', 'La boutique est vide pour le moment.\nRevenez bientôt !');
    const method = isUpdate ? 'editReply' : 'reply';
    return interaction[method]({ embeds: [embed], components: [], ephemeral: true });
  }

  const totalPages = products.length;
  const currentPage = Math.max(0, Math.min(page, totalPages - 1));
  const product = products[currentPage];

  // Webapp connectée → tenter de récupérer les produits distants
  // (on reste sur les produits locaux, la webapp est notifiée à l'achat)

  const userPoints = member?.points ?? 0;
  const canBuy = userPoints >= product.price_points && product.active;
  const stockLabel = product.stock === -1 ? '∞' : `${product.stock}`;
  const stockOk = product.stock === -1 || product.stock > 0;

  const deliveryLabel = product.requires_validation ? '⏳ Validation modérateur' : '⚡ Instantané';
  const rewardLabel = product.reward_type === 'role' && product.reward_role_id
    ? `🎭 Rôle <@&${product.reward_role_id}>`
    : '🎁 Voir avec les modérateurs';

  const embed = new EmbedBuilder()
    .setColor(canBuy && stockOk ? 0x6C5CE7 : 0x636E72)
    .setTitle(`🛒 ${product.name}`)
    .setDescription(product.description || '*Aucune description.*')
    .addFields(
      { name: '💰 Prix', value: `**${product.price_points} points**`, inline: true },
      { name: '📦 Stock', value: stockLabel, inline: true },
      { name: '⚙️ Livraison', value: deliveryLabel, inline: true },
      { name: '🎁 Récompense', value: rewardLabel, inline: true },
      { name: '💳 Votre solde', value: `**${userPoints} pts**`, inline: true },
      { name: '📊 Après achat', value: canBuy ? `**${userPoints - product.price_points} pts**` : '*Solde insuffisant*', inline: true },
    )
    .setFooter({ text: `Produit ${currentPage + 1} / ${totalPages} · ⚡ Designed by Hackend — Systeme.one` })
    .setTimestamp();

  if (product.image_url) {
    embed.setImage(product.image_url);
  }

  // Boutons navigation + achat
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`shop_prev_${currentPage}_${interaction.user.id}`)
      .setLabel('◀ Précédent')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 0),
    new ButtonBuilder()
      .setCustomId(`shop_next_${currentPage}_${interaction.user.id}`)
      .setLabel('Suivant ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`shop_buy_${product.id}_${interaction.user.id}`)
      .setLabel(`🛒 Acheter — ${product.price_points} pts`)
      .setStyle(canBuy && stockOk ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!canBuy || !stockOk),
    new ButtonBuilder()
      .setCustomId(`shop_myorders_${interaction.user.id}`)
      .setLabel('📋 Mes commandes')
      .setStyle(ButtonStyle.Primary),
  );

  const payload = { embeds: [embed], components: [navRow] };

  if (isUpdate) {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(payload);
    } else {
      await interaction.update(payload);
    }
  } else {
    await interaction.reply({ ...payload, ephemeral: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIQUE D'ACHAT
// ═══════════════════════════════════════════════════════════════════════════════

async function processBuy(interaction, productId) {
  await interaction.deferUpdate();

  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  const config = getConfig(guildId);

  const product = getShopProduct(parseInt(productId));
  if (!product || !product.active) {
    return interaction.followUp({ embeds: [error('Produit indisponible', 'Ce produit n\'est plus disponible.')], ephemeral: true });
  }

  const member = ensureMember(guildId, userId, interaction.user.username);

  if (member.rewards_blocked) {
    return interaction.followUp({ embeds: [error('Bloqué', 'Vos récompenses sont bloquées par un modérateur.')], ephemeral: true });
  }

  if (member.points < product.price_points) {
    return interaction.followUp({
      embeds: [error('Solde insuffisant', `Il vous manque **${product.price_points - member.points} points**.\nVous avez : \`${member.points} pts\` | Requis : \`${product.price_points} pts\``)],
      ephemeral: true
    });
  }

  if (product.stock === 0) {
    return interaction.followUp({ embeds: [error('Rupture de stock', 'Ce produit est épuisé.')], ephemeral: true });
  }

  // Déduire les points
  addPoints(guildId, userId, -product.price_points, `Achat shop : ${product.name}`, 'shop');

  // Décrémenter le stock si limité
  if (product.stock > 0) decrementStock(product.id);

  // Créer la commande
  const orderId = createOrder(guildId, userId, product.id, product.name, product.price_points);

  // ── Achat instantané ───────────────────────────────────────────────────────
  if (!product.requires_validation) {
    await deliverInstant(interaction, guildId, userId, product, orderId, config);
    return;
  }

  // ── Achat avec validation modérateur ──────────────────────────────────────
  await deliverPendingValidation(interaction, guildId, userId, product, orderId, config);
}

async function deliverInstant(interaction, guildId, userId, product, orderId, config) {
  let deliveryLog = [];

  // 1. Donner le rôle si configuré
  if (product.reward_type === 'role' && product.reward_role_id) {
    try {
      const gMember = await interaction.guild.members.fetch(userId);
      await gMember.roles.add(product.reward_role_id);
      deliveryLog.push(`✅ Rôle <@&${product.reward_role_id}> attribué`);
    } catch (e) {
      deliveryLog.push(`⚠️ Impossible d'attribuer le rôle : ${e.message}`);
    }
  }

  // 2. Sync webapp si configurée
  if (config.webapp_api_url) {
    await syncOrderToWebapp(config, guildId, userId, product, orderId);
    deliveryLog.push('🌐 Synchronisé avec la webapp');
  }

  updateOrder(orderId, { status: 'delivered' });

  // DM à l'utilisateur
  try {
    const userObj = await interaction.client.users.fetch(userId);
    await userObj.send({
      embeds: [new EmbedBuilder()
        .setColor(0x00B894)
        .setTitle('🎉 Achat confirmé !')
        .setDescription(`Votre achat de **${product.name}** a été traité.\n\n${deliveryLog.join('\n') || ''}`)
        .addFields({ name: '💰 Points dépensés', value: `${product.price_points} pts`, inline: true })
        .setFooter({ text: '⚡ Designed by Hackend — Systeme.one' })
        .setTimestamp()
      ]
    });
  } catch (_) { }

  // Log canal bot
  await notifyBotLog(interaction.client, guildId, config,
    `🛒 Achat instantané — <@${userId}> a acheté **${product.name}** (${product.price_points} pts) · Commande #${orderId}`
  );

  await interaction.followUp({
    embeds: [success('Achat effectué ! 🎉', `**${product.name}** a été livré.\n${deliveryLog.join('\n')}`)],
    ephemeral: true
  });
}

async function deliverPendingValidation(interaction, guildId, userId, product, orderId, config) {
  // Notifier les Bot Managers dans le salon log
  let notifMsgId = '';

  if (config.channel_botlog_id) {
    try {
      const logChannel = interaction.guild.channels.cache.get(config.channel_botlog_id);
      if (logChannel) {
        const notifEmbed = new EmbedBuilder()
          .setColor(0xFDCB6E)
          .setTitle('🛒 Commande à valider')
          .setDescription(`<@${userId}> a commandé **${product.name}** et attend votre validation.`)
          .addFields(
            { name: '🆔 Commande', value: `#${orderId}`, inline: true },
            { name: '💰 Points dépensés', value: `${product.price_points} pts`, inline: true },
            { name: '👤 Acheteur', value: `<@${userId}>`, inline: true },
          )
          .setFooter({ text: '⚡ Designed by Hackend — Systeme.one' })
          .setTimestamp();

        if (product.image_url) notifEmbed.setThumbnail(product.image_url);

        const modRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`order_approve_${orderId}`).setLabel('✅ Approuver').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`order_reject_${orderId}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`order_note_${orderId}`).setLabel('📝 Note').setStyle(ButtonStyle.Secondary),
        );

        const ping = config.role_botmanager_id ? `<@&${config.role_botmanager_id}>` : '';
        const notifMsg = await logChannel.send({ content: ping, embeds: [notifEmbed], components: [modRow] });
        notifMsgId = notifMsg.id;
      }
    } catch (e) { console.error('[shop notif]', e.message); }
  }

  updateOrder(orderId, { status: 'pending', notif_msg_id: notifMsgId });

  await interaction.followUp({
    embeds: [new EmbedBuilder()
      .setColor(0xFDCB6E)
      .setTitle('⏳ Commande en attente')
      .setDescription(`Votre commande pour **${product.name}** a été soumise.\nUn modérateur va la valider prochainement.\n\n🆔 Commande : \`#${orderId}\``)
      .setFooter({ text: '⚡ Designed by Hackend — Systeme.one' })
      .setTimestamp()
    ],
    ephemeral: true
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION MODÉRATEUR
// ═══════════════════════════════════════════════════════════════════════════════

async function handleOrderApprove(interaction, orderId) {
  const { valid, config } = checkLicense(interaction.guild.id);
  if (!valid || (!isBotManager(interaction.member, config) && !isAdmin(interaction.member))) {
    return interaction.reply({ embeds: [error('Accès refusé', 'Réservé aux Bot Managers.')], ephemeral: true });
  }

  await interaction.deferUpdate();
  const order = getOrder(parseInt(orderId));
  if (!order || order.status !== 'pending') {
    return interaction.followUp({ embeds: [warning('Déjà traitée', 'Cette commande a déjà été traitée.')], ephemeral: true });
  }

  const product = getShopProduct(order.product_id);
  const guildId = interaction.guild.id;

  // Livrer le rôle si applicable
  let deliveryLog = [];
  if (product?.reward_type === 'role' && product.reward_role_id) {
    try {
      const gMember = await interaction.guild.members.fetch(order.user_id);
      await gMember.roles.add(product.reward_role_id);
      deliveryLog.push(`✅ Rôle <@&${product.reward_role_id}> attribué`);
    } catch (e) {
      deliveryLog.push(`⚠️ Rôle : ${e.message}`);
    }
  }

  // Sync webapp
  if (config.webapp_api_url && product) {
    await syncOrderToWebapp(config, guildId, order.user_id, product, order.id);
    deliveryLog.push('🌐 Webapp synchronisée');
  }

  updateOrder(order.id, { status: 'delivered', moderator_id: interaction.user.id });

  // DM acheteur
  try {
    const userObj = await interaction.client.users.fetch(order.user_id);
    await userObj.send({
      embeds: [success('Commande approuvée ! 🎉',
        `Votre commande **${order.product_name}** a été approuvée par un modérateur.\n${deliveryLog.join('\n')}`
      )]
    });
  } catch (_) { }

  await interaction.followUp({
    embeds: [success('Commande approuvée', `Commande #${order.id} livrée à <@${order.user_id}>.\n${deliveryLog.join('\n')}`)],
    ephemeral: false
  });

  await disableOrderButtons(interaction);
}

async function handleOrderReject(interaction, orderId) {
  const { valid, config } = checkLicense(interaction.guild.id);
  if (!valid || (!isBotManager(interaction.member, config) && !isAdmin(interaction.member))) {
    return interaction.reply({ embeds: [error('Accès refusé', '')], ephemeral: true });
  }

  await interaction.deferUpdate();
  const order = getOrder(parseInt(orderId));
  if (!order || order.status !== 'pending') {
    return interaction.followUp({ embeds: [warning('Déjà traitée', 'Commande déjà traitée.')], ephemeral: true });
  }

  // Rembourser les points
  ensureMember(order.guild_id, order.user_id, '');
  addPoints(order.guild_id, order.user_id, order.points_spent, `Remboursement commande #${order.id} refusée`, 'moderator');
  updateOrder(order.id, { status: 'rejected', moderator_id: interaction.user.id });

  try {
    const userObj = await interaction.client.users.fetch(order.user_id);
    await userObj.send({
      embeds: [warning('Commande refusée',
        `Votre commande **${order.product_name}** a été refusée.\n**${order.points_spent} points** vous ont été remboursés.`
      )]
    });
  } catch (_) { }

  await interaction.followUp({
    embeds: [success('Commande refusée', `Commande #${order.id} refusée. ${order.points_spent} pts remboursés à <@${order.user_id}>.`)],
    ephemeral: false
  });

  await disableOrderButtons(interaction);
}

async function handleOrderNote(interaction, orderId) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_ordernote_${orderId}`)
    .setTitle('📝 Note sur la commande');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('note')
        .setLabel('Note (visible par les modérateurs)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
    )
  );
  await interaction.showModal(modal);
}

async function handleOrderNoteModal(interaction, orderId) {
  const note = interaction.fields.getTextInputValue('note');
  updateOrder(parseInt(orderId), { note });
  await interaction.reply({ embeds: [success('Note ajoutée', `Note enregistrée pour la commande #${orderId}.`)], ephemeral: true });
}

async function disableOrderButtons(interaction) {
  try {
    const done = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('order_done').setLabel('✅ Traitée').setStyle(ButtonStyle.Secondary).setDisabled(true)
    );
    await interaction.message.edit({ components: [done] });
  } catch (_) { }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MES COMMANDES
// ═══════════════════════════════════════════════════════════════════════════════

async function showMyOrders(interaction) {
  await interaction.deferUpdate();
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;

  const orders = getUserOrders(guildId, userId);

  if (!orders.length) {
    return interaction.followUp({
      embeds: [sone('📋 Mes commandes', 'Vous n\'avez encore passé aucune commande.')],
      ephemeral: true
    });
  }

  const statusEmoji = { pending: '⏳', delivered: '✅', rejected: '❌' };
  const lines = orders.map(o => {
    const date = new Date(o.created_at * 1000).toLocaleDateString('fr-FR');
    const s = statusEmoji[o.status] || '❓';
    return `${s} \`#${o.id}\` **${o.product_name}** — ${o.points_spent} pts — *${date}*`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x6C5CE7)
    .setTitle('📋 Mes commandes')
    .setDescription(lines.join('\n'))
    .setFooter({ text: '⚡ Designed by Hackend — Systeme.one' })
    .setTimestamp();

  await interaction.followUp({ embeds: [embed], ephemeral: true });
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEBAPP SYNC
// ═══════════════════════════════════════════════════════════════════════════════

async function syncOrderToWebapp(config, guildId, userId, product, orderId) {
  if (!config.webapp_api_url) return;
  try {
    await axios.post(`${config.webapp_api_url}/orders`, {
      guildId, userId,
      productId: product.id,
      productName: product.name,
      pointsSpent: product.price_points,
      orderId,
    }, {
      headers: { Authorization: `Bearer ${config.webapp_api_key}`, 'Content-Type': 'application/json' },
      timeout: 5000,
    });
  } catch (e) {
    console.error('[shop webapp sync]', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SALON SHOP PERMANENT (épinglé)
// ═══════════════════════════════════════════════════════════════════════════════

async function publishShopChannel(client, guildId) {
  const config = getConfig(guildId);
  if (!config?.channel_shop_id) return;

  const channel = client.channels.cache.get(config.channel_shop_id);
  if (!channel) return;

  const products = getShopProducts(guildId);
  if (!products.length) return;

  // Supprimer les anciens messages du bot dans ce salon
  try {
    const fetched = await channel.messages.fetch({ limit: 20 });
    const botMsgs = fetched.filter(m => m.author.id === client.user.id);
    for (const [, msg] of botMsgs) {
      await msg.delete().catch(() => {});
    }
  } catch (_) {}

  // Poster un embed par produit (max 10 pour le salon)
  const toShow = products.slice(0, 10);
  for (const product of toShow) {
    const stockLabel = product.stock === -1 ? '∞' : `${product.stock}`;
    const deliveryLabel = product.requires_validation ? '⏳ Validation modérateur' : '⚡ Instantané';

    const embed = new EmbedBuilder()
      .setColor(0x6C5CE7)
      .setTitle(`🛒 ${product.name}`)
      .setDescription(product.description || '*Aucune description.*')
      .addFields(
        { name: '💰 Prix', value: `**${product.price_points} points**`, inline: true },
        { name: '📦 Stock', value: stockLabel, inline: true },
        { name: '⚙️ Livraison', value: deliveryLabel, inline: true },
      )
      .setFooter({ text: '⚡ Designed by Hackend — Systeme.one' });

    if (product.image_url) embed.setImage(product.image_url);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`shop_buy_${product.id}_channel`)
        .setLabel(`🛒 Acheter — ${product.price_points} pts`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(product.stock === 0),
    );

    await channel.send({ embeds: [embed], components: [row] }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOG HELPER
// ═══════════════════════════════════════════════════════════════════════════════

async function notifyBotLog(client, guildId, config, message) {
  if (!config?.channel_botlog_id) return;
  const ch = client.channels.cache.get(config.channel_botlog_id);
  if (!ch) return;
  try {
    await ch.send({
      embeds: [new EmbedBuilder()
        .setColor(0x74B9FF)
        .setDescription(message)
        .setFooter({ text: '⚡ Designed by Hackend — Systeme.one' })
        .setTimestamp()
      ]
    });
  } catch (_) { }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports.handlers = {
  showShopPage,
  processBuy,
  handleOrderApprove,
  handleOrderReject,
  handleOrderNote,
  handleOrderNoteModal,
  showMyOrders,
  publishShopChannel,
};
