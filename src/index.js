const { Client, GatewayIntentBits, Collection, Partials } = require("discord.js");

console.clear();

const client = new Client({
  intents: Object.values(GatewayIntentBits),
  partials: Object.values(Partials)
});

module.exports = client;

client.slashCommands = new Collection();

const { token } = require("../config.json");
client.login(token);

const evento = require("./handler/Events");
const { lg, us } = require("./databases");

evento.run(client);
require("./handler/index")(client);

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚫 Erro Detectado (unhandledRejection):\n');
  console.error(reason instanceof Error ? reason.stack : reason);
});

process.on('uncaughtException', (error, origin) => {
  console.error('🚫 Erro Detectado (uncaughtException):\n');
  console.error(error.stack || error);

  const match = (error.stack || '').match(/\((.*):(\d+):(\d+)\)/);
  if (match) {
    console.log('Arquivo:', match[1]);
    console.log('Linha:', match[2]);
    console.log('Coluna:', match[3]);
  }
});
