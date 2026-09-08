import {
  profileService,
  formatProfile,
} from '#features/rpg/services/profile-service.js';

export default {
  name: 'profile',
  aliases: ['profil'],
  category: 'rpg',
  description: 'Lihat profil RPG kamu',
  cooldown: 10_000,

  async execute(ctx) {
    try {
      const data = await profileService.getProfileData(ctx.sender);
      await ctx.reply(formatProfile(data));
    } catch (err) {
      await ctx.fail(err.message);
    }
  },
};
