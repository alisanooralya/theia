import {
  profileService,
  formatProfile,
} from '#features/rpg/services/profile-service.js';

export default {
  name: 'profile',
  aliases: ['profil', 'rpg', 'char', 'character'],
  category: 'rpg',
  description: 'Lihat profil RPG kamu',
  cooldown: 5_000,

  async execute(ctx) {
    try {
      const data = await profileService.getProfileData(ctx.sender);
      await ctx.reply(formatProfile(data));
    } catch (err) {
      await ctx.reply(`Gagal membuka profile: ${err.message}`);
    }
  },
};
