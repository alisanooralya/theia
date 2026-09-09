import {
  profileService,
  formatProfile,
} from '#features/rpg/services/profile-service.js';
import { renderProfileCard, cardArtPath } from '#features/rpg/index.js';
import { Button } from '#messages/builder.js';

export default {
  name: 'profile',
  aliases: ['profil'],
  category: 'rpg',
  description: 'Lihat profil RPG kamu',
  cooldown: 10_000,

  async execute(ctx) {
    try {
      const data = await profileService.getProfileData(ctx.sender);

      if (!data.main) {
        await ctx.reply(formatProfile(data));
        return;
      }

      const artPath = cardArtPath(data.main.name.toLowerCase());
      const image = await renderProfileCard({
        ...data,
        name: ctx.pushName || 'Unknown',
        hp: data.currentHp,
        artPath,
      });

      const builder = new Button(ctx.sock)
        .setBody(formatProfile(data))
        .setImage(image);

      builder.send(ctx.jid);
    } catch (err) {
      await ctx.fail(err.message);
    }
  },
};
