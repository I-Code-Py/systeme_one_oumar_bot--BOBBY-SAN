// events/interactionCreate.js — Central Interaction Router
const setupHandlers = require('../commands/setup').handlers;
const paramsHandlers = require('../commands/parametres').handlers;
const { dashboardCmd, profilCmd, prisonCmd } = require('../commands/dashboard');
const dashboardHandlers = require('../commands/dashboard').handlers;
const confHandlers = require('../commands/conference');
const testimonialHandlers = require('../commands/temoignage').handlers;
const { getConfig, getLeaderboard, getMember, ensureMember } = require('../utils/database');
const { error, success, leaderboard } = require('../utils/embeds');
const { checkLicense, isBotManager, isHackend } = require('../utils/guards');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      // ── Slash Commands ──────────────────────────────────────────────────────
      if (interaction.isChatInputCommand()) {
        const { client } = interaction;
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction);
        return;
      }

      // ── Modals ──────────────────────────────────────────────────────────────
      if (interaction.isModalSubmit()) {
        const id = interaction.customId;

        if (id === 'setup_license_modal') return setupHandlers.handleSetupModal(interaction);
        if (id === 'setup_roles_modal') return setupHandlers.handleRolesModal(interaction);
        if (id === 'setup_perso_modal') return setupHandlers.handlePersoModal(interaction);
        if (id === 'params_points_modal') return paramsHandlers.handleParamsPointsModal(interaction);
        if (id === 'params_webapp_modal') return paramsHandlers.handleWebappModal(interaction);

        // Points profil
        if (id.startsWith('modal_addpts_')) {
          const targetId = id.replace('modal_addpts_', '');
          ensureMember(interaction.guild.id, targetId, '');
          return dashboardHandlers.handleAddPtsModal(interaction, targetId);
        }
        if (id.startsWith('modal_rmvpts_')) {
          const targetId = id.replace('modal_rmvpts_', '');
          return dashboardHandlers.handleRmvPtsModal(interaction, targetId);
        }
        if (id.startsWith('modal_note_')) {
          const targetId = id.replace('modal_note_', '');
          return dashboardHandlers.handleNoteModal(interaction, targetId);
        }

        return;
      }

      // ── Buttons ─────────────────────────────────────────────────────────────
      if (interaction.isButton()) {
        const id = interaction.customId;

        // Setup buttons
        if (id === 'setup_step1') return setupHandlers.handleSetupStep1(interaction);
        if (id === 'setup_step2') return setupHandlers.handleSetupStep2(interaction);
        if (id === 'setup_step3') return setupHandlers.handleSetupStep3(interaction);
        if (id === 'setup_step4_vocal_on') return setupHandlers.handleSetupStep4(interaction, true, true);
        if (id === 'setup_step4_vocal_off') return setupHandlers.handleSetupStep4(interaction, false, true);
        if (id === 'setup_step4_text_on') return setupHandlers.handleSetupStep4(interaction, true, true);
        if (id === 'setup_step4_text_off') return setupHandlers.handleSetupStep4(interaction, true, false);

        // Params buttons
        if (id === 'params_points') return paramsHandlers.handleParamsPoints(interaction);
        if (id === 'params_rewards_toggle') return paramsHandlers.handleRewardsToggle(interaction);
        if (id === 'params_excluded') return paramsHandlers.handleParamsExcluded(interaction);
        if (id === 'params_webapp') return paramsHandlers.handleParamsWebapp(interaction);

        // Dashboard refresh
        if (id === 'dashboard_refresh') {
          await interaction.deferUpdate();
          const config = getConfig(interaction.guild.id);
          const rows = getLeaderboard(interaction.guild.id, 20);
          const embed = leaderboard(rows, interaction.guild.name);
          return interaction.editReply({ embeds: [embed] });
        }

        // Profil buttons
        if (id.startsWith('profile_prison_')) return dashboardHandlers.handleProfilePrison(interaction, id.replace('profile_prison_', ''));
        if (id.startsWith('profile_addpts_')) return dashboardHandlers.handleProfileAddPts(interaction, id.replace('profile_addpts_', ''));
        if (id.startsWith('profile_rmvpts_')) return dashboardHandlers.handleProfileRmvPts(interaction, id.replace('profile_rmvpts_', ''));
        if (id.startsWith('profile_block_')) return dashboardHandlers.handleProfileBlock(interaction, id.replace('profile_block_', ''));
        if (id.startsWith('profile_note_')) return dashboardHandlers.handleProfileNote(interaction, id.replace('profile_note_', ''));

        // Prison buttons
        if (id.startsWith('prison_release_')) return dashboardHandlers.handlePrisonRelease(interaction, id.replace('prison_release_', ''));
        if (id.startsWith('prison_close_')) return dashboardHandlers.handlePrisonClose(interaction, id.replace('prison_close_', ''));

        // Témoignage — utilisateur
        if (id.startsWith('testimonial_submitted_')) return testimonialHandlers.handleTestimonialSubmitted(interaction, id.replace('testimonial_submitted_', ''));
        if (id.startsWith('testimonial_cancel_')) return testimonialHandlers.handleTestimonialCancel(interaction, id.replace('testimonial_cancel_', ''));

        // Témoignage — modération
        if (id.startsWith('tmod_approve_')) return testimonialHandlers.handleTmodApprove(interaction, id.replace('tmod_approve_', ''));
        if (id.startsWith('tmod_reject_')) return testimonialHandlers.handleTmodReject(interaction, id.replace('tmod_reject_', ''));
        if (id.startsWith('tmod_ban_')) return testimonialHandlers.handleTmodBan(interaction, id.replace('tmod_ban_', ''));

        return;
      }

      // ── Select Menus ─────────────────────────────────────────────────────────
      if (interaction.isStringSelectMenu()) {
        const id = interaction.customId;
        if (id === 'params_excluded_select') return paramsHandlers.handleExcludedSelect(interaction);
        return;
      }

    } catch (err) {
      console.error('[InteractionCreate]', err);
      const reply = { embeds: [error('Erreur interne', `Une erreur inattendue s'est produite.\n\`${err.message}\``)], ephemeral: true };
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else if (interaction.isRepliable?.()) {
          await interaction.reply(reply);
        }
      } catch (_) { }
    }
  }
};
