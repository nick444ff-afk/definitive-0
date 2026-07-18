const { ApplicationCommandType } = require("discord.js");

module.exports = {
    name: "ping", 
    description: "[🤖] Veja o PING do bot!", 
    type: ApplicationCommandType.ChatInput,
    run: async(client, interaction) => { 
        const sent = await interaction.reply({ 
            content: `Olá ${interaction.user}, calculando ping...`,
            fetchReply: true
        });

        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        
        await interaction.editReply({
            content: `${interaction.user}, Meu Ping está em: ${latency}ms (WebSocket: ${client.ws.ping}ms)`
        });
    }
};
