const { 
    ApplicationCommandType, 
    EmbedBuilder
} = require("discord.js");

const { owner } = require("../../databases/index");

module.exports = {
    name: "setpainel",
    description: "seta o painel das filas",
    type: ApplicationCommandType.ChatInput,

    run: async (client, interaction) => {

        if (!owner.includes(interaction.user.id)) {
            return interaction.reply({
                content: `\`❌\` Você não tem permissão usar este comando.`,
                flags: 64
            });
        }

        await interaction.reply({
            content: `\`🔁\` Preparando o painel...`,
            flags: 64
        });

        const embed = new EmbedBuilder()
            
            .setDescription(`
## <:v_pentagram_h1t:1500217915566461092> Central Filas Automatizadas
> Utilize o menu abaixo para acessar as opções disponíveis.
`)
              .setColor("#ff0000")
              .setImage("https://cdn.discordapp.com/attachments/1459917755204636725/1500219491974647878/IMG_1531.png?")  
                .setFooter({
                text: interaction.guild.name,
                iconURL: interaction.guild.iconURL() || null
            })
            .setTimestamp();

        await interaction.channel.send({
            embeds: [embed],
            components: [
                {
                    type: 1, // Action Row
                    components: [
                        {
                            type: 3, // String Select Menu
                            custom_id: 'system_queues_join',
                            placeholder: ' Selecione uma opção',
                            min_values: 1,
                            max_values: 1,
                            options: [
                                {
                                    label: 'Configuração',
                                    description: 'Configure o sistema de filas',
                                    emoji: { id: '1488068429578768384' },
                                    value: 'config'
                                },
                                {
                                    label: 'Iniciar',
                                    description: 'Iniciar sistema automático',
                                    emoji: { id: '1488072811472879687' },
                                    value: 'inic'
                                }
                            ]
                        }
                    ]
                }
            ]
        }).then(msg => msg.pin());

        await interaction.editReply({
            content: `\`✅\` Painel enviado com sucesso.`,
            flags: 64
        });
    }
};
