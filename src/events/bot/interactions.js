const { InteractionType } = require("discord.js");

module.exports = {
    name: "interactionCreate",
    run: async(interaction, client) => {
        if(interaction.type === InteractionType.ApplicationCommand) {
            const cmd = client.slashCommands.get(interaction.commandName);
            
            if (!cmd) return;
            
            interaction.member = interaction.guild.members.cache.get(interaction.user.id);
            
            try {
                await cmd.run(client, interaction);
            } catch (error) {
                console.error(`Erro ao executar comando ${interaction.commandName}:`, error);
                if (!interaction.replied && !interaction.deferred) {
                    interaction.reply({ content: "`❌` Erro ao executar comando.", flags: [64] }).catch(() => {});
                }
            }
        }
    }
};
