import { cooldownModel } from '#storage/models/index.js';

export default {
  name: 'cooldown-cleaner',

  async init() {
    await this._run();
    this._interval = setInterval(() => this._run(), 10 * 60 * 1000);
  },

  destroy() {
    clearInterval(this._interval);
  },

  async _run() {
    await cooldownModel.cleanup();
  },
};
