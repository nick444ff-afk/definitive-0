const fs = require("fs");
const path = require("path");
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

module.exports = async (client) => {
  const SlashsArray = [];
  const commandsFolder = path.join(__dirname, "../commands");

  fs.readdir(commandsFolder, (error, folders) => {
    if (error) {
      console.error(`Erro ao ler pasta de comandos: ${error}`);
      return;
    }

    folders.forEach((subfolder) => {
      const subfolderPath = path.join(commandsFolder, subfolder);

      fs.readdir(subfolderPath, (error, files) => {
        if (error) {
          console.error(`Erro ao ler subpasta ${subfolder}: ${error}`);
          return;
        }

        files.forEach((file) => {
          if (!file?.endsWith(".js")) return;

          try {
            const filePath = path.join(subfolderPath, file);
            const command = require(filePath);

            if (!command?.name) return;

            client.slashCommands.set(command.name, command);
            SlashsArray.push(command);
          } catch (error) {
            console.error(`Erro ao carregar comando ${file}: ${error}`);
          }
        });
      });
    }); 
  });

  client.once("clientReady", async () => {
    try {
      const rest = new REST({ version: '9' }).setToken(client.token);

      const existingCommands = await rest.get(
        Routes.applicationCommands(client.user.id)
      );

      for (const existingCommand of existingCommands) {
        try {
          await rest.delete(
            Routes.applicationCommand(client.user.id, existingCommand.id)
          );
        } catch (error) {
          console.error(`Erro ao deletar comando ${existingCommand.id}: ${error}`);
        }
      }

      client.guilds.cache.forEach((guild) => {
        try {
          guild.commands.set(SlashsArray);
        } catch (error) {
          console.error(`Erro ao registrar comandos no guild ${guild.id}: ${error}`);
        }
      });
    } catch (error) {
      console.error(`Erro ao sincronizar comandos: ${error}`);
    }
  });

  client.on("guildCreate", async (guild) => {
    try {
      await guild.commands.set(SlashsArray);
    } catch (error) {
      console.error(`Erro ao registrar comandos no novo guild ${guild.id}: ${error}`);
    }
  });
};
