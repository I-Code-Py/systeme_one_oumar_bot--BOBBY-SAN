// commands/shopAdmin.js — Gestion des produits shop via /paramètres
// Designed by Hackend — Systeme.one
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, ChannelType
} = require('discord.js');
const {
  getConfig, setConfig,
  getShopProducts, getShopProduct, createShopProduct, updateShopProduct, deleteShopProduct, db
} = require('../utils/database');
const { error, success, warning, sone } = require('../utils/embeds');
const { isAdmin, isBotManager } = require('../utils/guards');
const { publishShopChannel } = require('./shop').handlers;

// ─── Menu principal de gestion du shop ───────────────────────────────────────

async function showShopAdminMenu(interaction) {
  const guildId = interaction.guild.id;
  const products = getShopProducts(guildId, false); // tous produits y compris désactivés
  const config = getConfig(guildId);

  const lines = products.length
    ? products.map(p => {
        const status = p.active ? '🟢' : '🔴';
        const stock = p.stock === -1 ? '∞' : p.stock;
        return `${status} \`#${p.id}\` **${p.name}** — ${p.price_points} pts · Stock: ${stock}`;
      }).join('\n')
    : '*Aucun produit configuré.*';

  const shopChannel = config.channel_shop_id
    ? `<#${config.channel_shop_id}>`
    : '*Non défini*';

  const embed = sone(
    '🛒 Gestion du Shop',
    `**Salon shop :** ${shopChannel}\n\n**Produits :**\n${lines}`
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('shop_admin_add').setLabel('➕ Ajouter un produit').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('shop_admin_set_channel').setLabel('📢 Définir le salon shop').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('shop_admin_publish').setLabel('🔄 Republier le salon').setStyle(ButtonStyle.Secondary),
  );

  const rows = [row1];

  if (products.length) {
    // Select pour éditer/supprimer
    const options = products.slice(0, 25).map(p => ({
      label: `#${p.id} — ${p.name}`.substring(0, 25),
      value: String(p.id),
      description: `${p.price_points} pts · ${p.active ? 'Actif' : 'Désactivé'}`,
      emoji: p.active ? '🟢' : '🔴',
    }));

    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('shop_admin_select_product')
          .setPlaceholder('Sélectionner un produit à modifier...')
          .addOptions(options)
      )
    );
  }

  const method = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  await interaction[method]({ embeds: [embed], components: rows, ephemeral: true });
}

// ─── Ajouter un produit (étape 1 — modal infos de base) ──────────────────────

async function handleShopAdminAdd(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('shop_add_modal_1')
    .setTitle('➕ Nouveau produit — Infos');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('name').setLabel('Nom du produit').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('image_url').setLabel('URL de l\'image (optionnel)').setStyle(TextInputStyle.Short).setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('price_points').setLabel('Prix en points').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('50')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('stock').setLabel('Stock (-1 = illimité)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('-1')
    )
  );

  await interaction.showModal(modal);
}

async function handleShopAddModal1(interaction) {
  const name = interaction.fields.getTextInputValue('name').trim();
  const description = interaction.fields.getTextInputValue('description').trim();
  const image_url = interaction.fields.getTextInputValue('image_url').trim();
  const price_points = parseInt(interaction.fields.getTextInputValue('price_points')) || 0;
  const stock = parseInt(interaction.fields.getTextInputValue('stock') || '-1');

  if (!name || price_points < 0) {
    return interaction.reply({ embeds: [error('Données invalides', 'Nom requis et prix ≥ 0.')], ephemeral: true });
  }

  // Stocker temporairement en kv_store
  const tempKey = `shop_new_${interaction.user.id}`;
  db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)').run(
    tempKey,
    JSON.stringify({ name, description, image_url, price_points, stock })
  );

  // Étape 2 — choisir le type de récompense
  const embed = sone(
    '➕ Nouveau produit — Récompense',
    `**${name}** — ${price_points} pts\n\nChoisissez le type de récompense :`
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('shop_add_reward_role').setLabel('🎭 Donner un rôle').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('shop_add_reward_none').setLabel('🎁 Aucune récompense auto').setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

// Récompense = rôle → modal pour l'ID du rôle
async function handleShopAddRewardRole(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('shop_add_modal_role')
    .setTitle('🎭 Rôle de récompense');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('role_id').setLabel('ID du rôle à attribuer').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Clic droit sur le rôle → Copier l\'ID')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('requires_validation').setLabel('Validation modérateur ? (oui/non)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('non')
    )
  );

  await interaction.showModal(modal);
}

async function handleShopAddModalRole(interaction) {
  const roleId = interaction.fields.getTextInputValue('role_id').trim();
  const requiresVal = interaction.fields.getTextInputValue('requires_validation').trim().toLowerCase();
  const requires_validation = requiresVal === 'oui' || requiresVal === 'yes' || requiresVal === '1';

  const role = interaction.guild.roles.cache.get(roleId);
  if (!role) {
    return interaction.reply({ embeds: [error('Rôle introuvable', 'L\'ID de rôle fourni est invalide.')], ephemeral: true });
  }

  await finalizeProductCreation(interaction, { reward_type: 'role', reward_role_id: roleId, requires_validation });
}

// Récompense = aucune → choisir si validation
async function handleShopAddRewardNone(interaction) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('shop_add_instant').setLabel('⚡ Achat instantané').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('shop_add_validation').setLabel('⏳ Validation modérateur').setStyle(ButtonStyle.Secondary),
  );

  await interaction.update({
    embeds: [sone('➕ Nouveau produit — Livraison', 'Ce produit nécessite-t-il une validation manuelle ?')],
    components: [row]
  });
}

async function handleShopAddInstant(interaction) {
  await finalizeProductCreation(interaction, { reward_type: 'none', reward_role_id: '', requires_validation: false });
}

async function handleShopAddValidation(interaction) {
  await finalizeProductCreation(interaction, { reward_type: 'none', reward_role_id: '', requires_validation: true });
}

async function finalizeProductCreation(interaction, rewardFields) {
  const guildId = interaction.guild.id;
  const tempKey = `shop_new_${interaction.user.id}`;
  const tempData = db.prepare('SELECT value FROM kv_store WHERE key = ?').get(tempKey);

  if (!tempData) {
    const method = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
    return interaction[method]({ embeds: [error('Session expirée', 'Recommencez la création du produit.')], ephemeral: true });
  }

  const base = JSON.parse(tempData.value);
  db.prepare('DELETE FROM kv_store WHERE key = ?').run(tempKey);

  const productId = createShopProduct(guildId, {
    ...base,
    ...rewardFields,
    sort_order: 0,
    created_by: interaction.user.id,
  });

  const product = getShopProduct(productId);
  const deliveryLabel = product.requires_validation ? '⏳ Validation modérateur' : '⚡ Instantané';
  const rewardLabel = product.reward_type === 'role' ? `Rôle <@&${product.reward_role_id}>` : 'Aucune récompense auto';

  const embed = success(
    'Produit créé !',
    `**${product.name}** a été ajouté à la boutique.\n\n` +
    `💰 Prix : **${product.price_points} pts**\n` +
    `📦 Stock : ${product.stock === -1 ? '∞' : product.stock}\n` +
    `⚙️ Livraison : ${deliveryLabel}\n` +
    `🎁 Récompense : ${rewardLabel}`
  );

  // Republier le salon shop si configuré
  const config = getConfig(guildId);
  if (config.channel_shop_id) {
    await publishShopChannel(interaction.client, guildId);
  }

  const method = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
  await interaction[method]({ embeds: [embed], components: [], ephemeral: true });
}

// ─── Éditer un produit ────────────────────────────────────────────────────────

async function handleShopSelectProduct(interaction) {
  const productId = interaction.values[0];
  const product = getShopProduct(parseInt(productId));
  if (!product) return interaction.reply({ embeds: [error('Introuvable', 'Produit introuvable.')], ephemeral: true });

  await interaction.deferUpdate();

  const stockLabel = product.stock === -1 ? '∞' : product.stock;
  const statusLabel = product.active ? '🟢 Actif' : '🔴 Désactivé';

  const embed = sone(
    `✏️ Produit #${product.id} — ${product.name}`,
    `Prix : **${product.price_points} pts** | Stock : ${stockLabel} | ${statusLabel}\n` +
    `Livraison : ${product.requires_validation ? '⏳ Validation' : '⚡ Instantané'}\n` +
    `Récompense : ${product.reward_type === 'role' ? `<@&${product.reward_role_id}>` : 'Aucune'}`
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`shop_edit_${product.id}`).setLabel('✏️ Modifier').setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`shop_toggle_${product.id}`)
      .setLabel(product.active ? '🔴 Désactiver' : '🟢 Activer')
      .setStyle(product.active ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`shop_delete_${product.id}`).setLabel('🗑️ Supprimer').setStyle(ButtonStyle.Danger),
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleShopEdit(interaction, productId) {
  const product = getShopProduct(parseInt(productId));
  if (!product) return interaction.reply({ embeds: [error('Introuvable', '')], ephemeral: true });

  const modal = new ModalBuilder()
    .setCustomId(`shop_edit_modal_${productId}`)
    .setTitle(`✏️ Modifier — ${product.name.substring(0, 20)}`);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('name').setLabel('Nom').setStyle(TextInputStyle.Short).setRequired(true).setValue(product.name)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(product.description || '')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('image_url').setLabel('URL image').setStyle(TextInputStyle.Short).setRequired(false).setValue(product.image_url || '')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('price_points').setLabel('Prix en points').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(product.price_points))
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('stock').setLabel('Stock (-1 = illimité)').setStyle(TextInputStyle.Short).setRequired(false).setValue(String(product.stock))
    )
  );

  await interaction.showModal(modal);
}

async function handleShopEditModal(interaction, productId) {
  const name = interaction.fields.getTextInputValue('name').trim();
  const description = interaction.fields.getTextInputValue('description').trim();
  const image_url = interaction.fields.getTextInputValue('image_url').trim();
  const price_points = parseInt(interaction.fields.getTextInputValue('price_points')) || 0;
  const stock = parseInt(interaction.fields.getTextInputValue('stock') || '-1');

  updateShopProduct(parseInt(productId), { name, description, image_url, price_points, stock });

  const config = getConfig(interaction.guild.id);
  if (config.channel_shop_id) await publishShopChannel(interaction.client, interaction.guild.id);

  await interaction.reply({ embeds: [success('Produit mis à jour', `**${name}** a été modifié.`)], ephemeral: true });
}

async function handleShopToggle(interaction, productId) {
  await interaction.deferUpdate();
  const product = getShopProduct(parseInt(productId));
  if (!product) return;

  updateShopProduct(product.id, { active: product.active ? 0 : 1 });

  const config = getConfig(interaction.guild.id);
  if (config.channel_shop_id) await publishShopChannel(interaction.client, interaction.guild.id);

  await interaction.followUp({
    embeds: [success('Statut modifié', `**${product.name}** est maintenant ${product.active ? '🔴 désactivé' : '🟢 activé'}.`)],
    ephemeral: true
  });
}

async function handleShopDelete(interaction, productId) {
  await interaction.deferUpdate();
  const product = getShopProduct(parseInt(productId));
  if (!product) return;

  deleteShopProduct(product.id);

  const config = getConfig(interaction.guild.id);
  if (config.channel_shop_id) await publishShopChannel(interaction.client, interaction.guild.id);

  await interaction.followUp({
    embeds: [success('Produit supprimé', `**${product.name}** a été retiré de la boutique.`)],
    ephemeral: true
  });
}

// ─── Définir le salon shop ────────────────────────────────────────────────────

async function handleShopSetChannel(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('shop_set_channel_modal')
    .setTitle('📢 Salon shop');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('channel_id')
        .setLabel('ID du salon (laissez vide pour désactiver)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Clic droit sur le salon → Copier l\'ID')
    )
  );

  await interaction.showModal(modal);
}

async function handleShopSetChannelModal(interaction) {
  const channelId = interaction.fields.getTextInputValue('channel_id').trim();

  if (!channelId) {
    setConfig(interaction.guild.id, { channel_shop_id: '' });
    return interaction.reply({ embeds: [success('Salon shop désactivé', 'Le salon shop permanent a été désactivé.')], ephemeral: true });
  }

  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel) {
    return interaction.reply({ embeds: [error('Salon introuvable', 'Vérifiez l\'ID fourni.')], ephemeral: true });
  }

  setConfig(interaction.guild.id, { channel_shop_id: channelId });
  await publishShopChannel(interaction.client, interaction.guild.id);

  await interaction.reply({
    embeds: [success('Salon shop défini', `Le shop sera publié dans <#${channelId}>.\nLes produits ont été postés automatiquement.`)],
    ephemeral: true
  });
}

async function handleShopAdminPublish(interaction) {
  await interaction.deferUpdate();
  const config = getConfig(interaction.guild.id);
  if (!config.channel_shop_id) {
    return interaction.followUp({ embeds: [warning('Pas de salon', 'Aucun salon shop configuré. Utilisez "Définir le salon shop".')], ephemeral: true });
  }

  await publishShopChannel(interaction.client, interaction.guild.id);
  await interaction.followUp({ embeds: [success('Shop republié', `Le salon <#${config.channel_shop_id}> a été mis à jour.`)], ephemeral: true });
}

module.exports = {
  showShopAdminMenu,
  handleShopAdminAdd,
  handleShopAddModal1,
  handleShopAddRewardRole,
  handleShopAddModalRole,
  handleShopAddRewardNone,
  handleShopAddInstant,
  handleShopAddValidation,
  handleShopSelectProduct,
  handleShopEdit,
  handleShopEditModal,
  handleShopToggle,
  handleShopDelete,
  handleShopSetChannel,
  handleShopSetChannelModal,
  handleShopAdminPublish,
};
