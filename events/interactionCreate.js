// events/interactionCreate.js — Central Interaction Router
// Designed by Hackend — Systeme.one
const setupHandlers    = require('../commands/setup').handlers;
const paramsHandlers   = require('../commands/parametres').handlers;
const shopAdmin        = require('../commands/shopAdmin');
const { dashboardCmd, profilCmd, prisonCmd } = require('../commands/dashboard');
const dashboardHandlers = require('../commands/dashboard').handlers;
const testimonialHandlers = require('../commands/temoignage').handlers;
const shopHandlers     = require('../commands/shop').handlers;
const { getConfig, getLeaderboard, ensureMember } = require('../utils/database');
const { error, success, leaderboard } = require('../utils/embeds');
const { checkLicense, isBotManager, isAdmin } = require('../utils/guards');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {

      // ══ SLASH COMMANDS ══════════════════════════════════════════════════════
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        return command.execute(interaction);
      }

      // ══ MODALS ══════════════════════════════════════════════════════════════
      if (interaction.isModalSubmit()) {
        const id = interaction.customId;

        // Setup
        if (id === 'setup_license_modal')  return setupHandlers.handleSetupModal(interaction);
        if (id === 'setup_roles_modal')    return setupHandlers.handleRolesModal(interaction);
        if (id === 'setup_perso_modal')    return setupHandlers.handlePersoModal(interaction);

        // Params
        if (id === 'params_points_modal')  return paramsHandlers.handleParamsPointsModal(interaction);
        if (id === 'params_webapp_modal')  return paramsHandlers.handleWebappModal(interaction);

        // Shop — création produit
        if (id === 'shop_add_modal_1')       return shopAdmin.handleShopAddModal1(interaction);
        if (id === 'shop_add_modal_role')     return shopAdmin.handleShopAddModalRole(interaction);
        if (id === 'shop_set_channel_modal')  return shopAdmin.handleShopSetChannelModal(interaction);

        // Shop — édition produit
        if (id.startsWith('shop_edit_modal_')) {
          const productId = id.replace('shop_edit_modal_', '');
          return shopAdmin.handleShopEditModal(interaction, productId);
        }

        // Shop — note commande
        if (id.startsWith('modal_ordernote_')) {
          const orderId = id.replace('modal_ordernote_', '');
          return shopHandlers.handleOrderNoteModal(interaction, orderId);
        }

        // Profil — points
        if (id.startsWith('modal_addpts_')) {
          const targetId = id.replace('modal_addpts_', '');
          ensureMember(interaction.guild.id, targetId, '');
          return dashboardHandlers.handleAddPtsModal(interaction, targetId);
        }
        if (id.startsWith('modal_rmvpts_')) {
          return dashboardHandlers.handleRmvPtsModal(interaction, id.replace('modal_rmvpts_', ''));
        }
        if (id.startsWith('modal_note_')) {
          return dashboardHandlers.handleNoteModal(interaction, id.replace('modal_note_', ''));
        }

        return;
      }

      // ══ BUTTONS ═════════════════════════════════════════════════════════════
      if (interaction.isButton()) {
        const id = interaction.customId;

        // ── Setup
        if (id === 'setup_step1')             return setupHandlers.handleSetupStep1(interaction);
        if (id === 'setup_step2')             return setupHandlers.handleSetupStep2(interaction);
        if (id === 'setup_step3')             return setupHandlers.handleSetupStep3(interaction);
        if (id === 'setup_step4_vocal_on')    return setupHandlers.handleSetupStep4(interaction, true, true);
        if (id === 'setup_step4_vocal_off')   return setupHandlers.handleSetupStep4(interaction, false, true);
        if (id === 'setup_step4_text_on')     return setupHandlers.handleSetupStep4(interaction, true, true);
        if (id === 'setup_step4_text_off')    return setupHandlers.handleSetupStep4(interaction, true, false);

        // ── Params
        if (id === 'params_points')          return paramsHandlers.handleParamsPoints(interaction);
        if (id === 'params_rewards_toggle')  return paramsHandlers.handleRewardsToggle(interaction);
        if (id === 'params_excluded')        return paramsHandlers.handleParamsExcluded(interaction);
        if (id === 'params_webapp')          return paramsHandlers.handleParamsWebapp(interaction);
        if (id === 'params_shop')            return shopAdmin.showShopAdminMenu(interaction);

        // ── Shop admin (création)
        if (id === 'shop_admin_add')          return shopAdmin.handleShopAdminAdd(interaction);
        if (id === 'shop_admin_set_channel')  return shopAdmin.handleShopSetChannel(interaction);
        if (id === 'shop_admin_publish')      return shopAdmin.handleShopAdminPublish(interaction);
        if (id === 'shop_add_reward_role')    return shopAdmin.handleShopAddRewardRole(interaction);
        if (id === 'shop_add_reward_none')    return shopAdmin.handleShopAddRewardNone(interaction);
        if (id === 'shop_add_instant')        return shopAdmin.handleShopAddInstant(interaction);
        if (id === 'shop_add_validation')     return shopAdmin.handleShopAddValidation(interaction);

        if (id.startsWith('shop_edit_'))     return shopAdmin.handleShopEdit(interaction, id.replace('shop_edit_', ''));
        if (id.startsWith('shop_toggle_'))   return shopAdmin.handleShopToggle(interaction, id.replace('shop_toggle_', ''));
        if (id.startsWith('shop_delete_'))   return shopAdmin.handleShopDelete(interaction, id.replace('shop_delete_', ''));

        // ── Shop navigation & achat
        if (id.startsWith('shop_prev_')) {
          const parts = id.split('_');           // ['shop','prev', page, userId]
          const page = parseInt(parts[2]) - 1;
          const requesterId = parts[3];
          if (requesterId !== interaction.user.id) {
            return interaction.reply({ embeds: [error('Navigation', 'Ce menu ne vous appartient pas.')], ephemeral: true });
          }
          return shopHandlers.showShopPage(interaction, interaction.guild.id, page, true);
        }
        if (id.startsWith('shop_next_')) {
          const parts = id.split('_');
          const page = parseInt(parts[2]) + 1;
          const requesterId = parts[3];
          if (requesterId !== interaction.user.id) {
            return interaction.reply({ embeds: [error('Navigation', 'Ce menu ne vous appartient pas.')], ephemeral: true });
          }
          return shopHandlers.showShopPage(interaction, interaction.guild.id, page, true);
        }
        if (id.startsWith('shop_buy_')) {
          // shop_buy_{productId}_{userId|'channel'}
          const parts = id.replace('shop_buy_', '').split('_');
          const productId = parts[0];
          // Si vient du salon shop (channel), vérifier que l'acheteur est bien connecté
          return shopHandlers.processBuy(interaction, productId);
        }
        if (id.startsWith('shop_myorders_')) {
          return shopHandlers.showMyOrders(interaction);
        }

        // ── Commandes shop — validation modérateur
        if (id.startsWith('order_approve_')) return shopHandlers.handleOrderApprove(interaction, id.replace('order_approve_', ''));
        if (id.startsWith('order_reject_'))  return shopHandlers.handleOrderReject(interaction, id.replace('order_reject_', ''));
        if (id.startsWith('order_note_'))    return shopHandlers.handleOrderNote(interaction, id.replace('order_note_', ''));

        // ── Dashboard
        if (id === 'dashboard_refresh') {
          await interaction.deferUpdate();
          const rows = getLeaderboard(interaction.guild.id, 20);
          return interaction.editReply({ embeds: [leaderboard(rows, interaction.guild.name)] });
        }

        // ── Profil
        if (id.startsWith('profile_prison_'))  return dashboardHandlers.handleProfilePrison(interaction, id.replace('profile_prison_', ''));
        if (id.startsWith('profile_addpts_'))  return dashboardHandlers.handleProfileAddPts(interaction, id.replace('profile_addpts_', ''));
        if (id.startsWith('profile_rmvpts_'))  return dashboardHandlers.handleProfileRmvPts(interaction, id.replace('profile_rmvpts_', ''));
        if (id.startsWith('profile_block_'))   return dashboardHandlers.handleProfileBlock(interaction, id.replace('profile_block_', ''));
        if (id.startsWith('profile_note_'))    return dashboardHandlers.handleProfileNote(interaction, id.replace('profile_note_', ''));

        // ── Prison
        if (id.startsWith('prison_release_')) return dashboardHandlers.handlePrisonRelease(interaction, id.replace('prison_release_', ''));
        if (id.startsWith('prison_close_'))   return dashboardHandlers.handlePrisonClose(interaction, id.replace('prison_close_', ''));

        // ── Témoignage — utilisateur
        if (id.startsWith('testimonial_submitted_')) return testimonialHandlers.handleTestimonialSubmitted(interaction, id.replace('testimonial_submitted_', ''));
        if (id.startsWith('testimonial_cancel_'))    return testimonialHandlers.handleTestimonialCancel(interaction, id.replace('testimonial_cancel_', ''));

        // ── Témoignage — modération
        if (id.startsWith('tmod_approve_')) return testimonialHandlers.handleTmodApprove(interaction, id.replace('tmod_approve_', ''));
        if (id.startsWith('tmod_reject_'))  return testimonialHandlers.handleTmodReject(interaction, id.replace('tmod_reject_', ''));
        if (id.startsWith('tmod_ban_'))     return testimonialHandlers.handleTmodBan(interaction, id.replace('tmod_ban_', ''));

        return;
      }

      // ══ SELECT MENUS ════════════════════════════════════════════════════════
      if (interaction.isStringSelectMenu()) {
        const id = interaction.customId;
        if (id === 'params_excluded_select')       return paramsHandlers.handleExcludedSelect(interaction);
        if (id === 'shop_admin_select_product')    return shopAdmin.handleShopSelectProduct(interaction);
        return;
      }

    } catch (err) {
      console.error('[InteractionCreate]', err);
      const payload = {
        embeds: [error('Erreur interne', `Une erreur inattendue s'est produite.\n\`${err.message}\``)],
        ephemeral: true
      };
      try {
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
        else if (interaction.isRepliable?.()) await interaction.reply(payload);
      } catch (_) { }
    }
  }
};
