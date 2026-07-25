const { InteractionType, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ModalBuilder, TextInputBuilder, EmbedBuilder, ChannelType } = require("discord.js");
const { lg, owner, us } = require("../../databases/index");
const { Client } = require('discord.js-selfbot-v13');
let verify = {};

const MAX_ENTRIES_PER_GUILD = 1;

module.exports = {
    name: "interactionCreate",
    run: async (interaction, client) => {
        const { user, customId, guild, channel, fields, values } = interaction;
        if (!customId) return;

        // ═══════════════════════════════════════════════════════════════
        // MENU PRINCIPAL
        // ═══════════════════════════════════════════════════════════════
        if (customId === "system_queues_join") {
            const option = values[0];

            interaction.message.edit({
                components: [
                    new ActionRowBuilder()
                        .addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId("system_queues_join")
                                .setMaxValues(1)
                                .setMinValues(1)
                                .setPlaceholder("Selecione uma opção")
                                .addOptions(
                                    {
                                        label: "Configuração",
                                        description: "Configure o sistema de Filas",
                                        emoji: "<:cloner_template_config:1488068429578768384>",
                                        value: "config"
                                    },
                                    {
                                        label: "Iniciar",
                                        description: "Inicie o sistema de Entrada automatica",
                                        emoji: "<:1289362432996806657:1479488984697667654>",
                                        value: "inic"
                                    }
                                )
                        )
                ]
            }).catch(err => console.error("[PANEL] Erro ao editar menu:", err.message));

            if (option === "config") {
                const modal = new ModalBuilder()
                    .setCustomId("config_system_queue")
                    .setTitle("Configure suas Filas");

                const userData = await us.get(`${user.id}`);

                const token = new TextInputBuilder()
                    .setCustomId("token")
                    .setLabel("Token do Usuario")
                    .setStyle(1)
                    .setRequired(true);
                if (userData?.token) token.setValue(userData.token);

                const msgauto = new TextInputBuilder()
                    .setCustomId("msgauto")
                    .setLabel("Deseja enviar mensagem na fila?")
                    .setStyle(2)
                    .setRequired(false)
                    .setMaxLength(2000)
                    .setPlaceholder("Envia mensagem na fila\nDeixe vazio caso não queira");
                if (userData?.msgauto) msgauto.setValue(userData.msgauto);

                const mentionauto = new TextInputBuilder()
                    .setCustomId("mentionauto")
                    .setLabel("Marcar o Adversário? ")
                    .setStyle(1)
                    .setRequired(false)
                    .setMaxLength(3)
                    .setPlaceholder("Coloque quantos segundos deseja. (Deixe vazio caso não queira)");
                if (userData?.mentionauto) mentionauto.setValue(`${userData.mentionauto}`);

                modal.addComponents(new ActionRowBuilder().addComponents(token));
                modal.addComponents(new ActionRowBuilder().addComponents(msgauto));
                modal.addComponents(new ActionRowBuilder().addComponents(mentionauto));

                return interaction.showModal(modal);

            } else if (option === "inic") {
                interaction.reply({
                    content: `<:white_lupa7cr:1488891816081100950> Escolha o formato da fila.\n\n- Formato: \`N/A\`\n- Categoria: \`N/A\``,
                    components: [
                        new ActionRowBuilder()
                            .addComponents(
                                new StringSelectMenuBuilder()
                                    .setCustomId("select_format")
                                    .setMaxValues(1)
                                    .setMinValues(1)
                                    .setPlaceholder("Selecione o formato")
                                    .addOptions(
                                        { label: "1x1", value: "1v1" },
                                        { label: "2x2", value: "2v2" },
                                        { label: "3x3", value: "3v3" },
                                        { label: "4x4", value: "4v4" }
                                    )
                            )
                    ],
                    flags: [64]
                });
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // SELEÇÃO DE FORMATO
        // ═══════════════════════════════════════════════════════════════
        if (customId === "select_format") {
            const userData = await us.get(`${user.id}`);
            const format = values[0];

            if (!userData?.token) return interaction.reply({
                content: `\`❌\` Você precisa configurar seu token primeiro.`,
                flags: [64]
            });

            const options = [
                { label: "📱 Mobile", value: "mobile" },
                { label: "🖥️ Emulador", value: "emulador" },
                { label: "🕹️ Misto", value: "misto" },
                { label: "❗ Tático", value: "tatico" }
            ];

            // Misto não existe para 1x1
            const filteredOptions = format === "1v1"
                ? options.filter(o => o.value !== "misto")
                : options;

            filteredOptions.push({
                label: "⬅️ Voltar",
                value: "voltar"
            });

            interaction.update({
                content: `<:white_lupa7cr:1488891816081100950> Escolha a categoria.\n\n- Formato: \`${format.replace("v", "x")}\`\n- Categoria: \`N/A\``,
                components: [
                    new ActionRowBuilder()
                        .addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId(`select_category_${format}`)
                                .setMaxValues(1)
                                .setMinValues(1)
                                .setPlaceholder("Selecione a categoria")
                                .addOptions(filteredOptions)
                        )
                ]
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // SELEÇÃO DE CATEGORIA → INICIAR AUTOMAÇÃO
        // ═══════════════════════════════════════════════════════════════
        if (customId.startsWith("select_category_")) {
            const format = customId.split("select_category_")[1];
            const category = values[0];

            if (category === "voltar") {
                return interaction.update({
                    content: `<:white_lupa7cr:1488891816081100950> Escolha o formato da fila.\n\n- Formato: \`N/A\`\n- Categoria: \`N/A\``,
                    components: [
                        new ActionRowBuilder()
                            .addComponents(
                                new StringSelectMenuBuilder()
                                    .setCustomId("select_format")
                                    .setMaxValues(1)
                                    .setMinValues(1)
                                    .setPlaceholder("Selecione o formato")
                                    .addOptions(
                                        { label: "1x1", value: "1v1" },
                                        { label: "2x2", value: "2v2" },
                                        { label: "3x3", value: "3v3" },
                                        { label: "4x4", value: "4v4" }
                                    )
                            )
                    ]
                });
            }

            const categoryNames = {
                mobile: "📱 Mobile",
                emulador: "🖥️ Emulador",
                misto: "🕹️ Misto",
                tatico: "❗ Tático"
            };

            interaction.update({
                content: `<:white_lupa7cr:1488891816081100950> Iniciando automação...\n\n- Formato: \`${format.replace("v", "x")}\`\n- Categoria: \`${categoryNames[category]}\``,
                components: []
            });

            await startQueueAutomation(interaction, user, format, category, client);
        }

        // ═══════════════════════════════════════════════════════════════
        // CONFIGURAÇÃO (MODAL SUBMIT)
        // ═══════════════════════════════════════════════════════════════
        if (customId === "config_system_queue") {
            const token = fields.getTextInputValue("token");
            const msgauto = fields.getTextInputValue("msgauto") || false;
            const mentionautoNumber = fields.getTextInputValue("mentionauto") || false;


            await interaction.reply({
                content: `<:1289362432996806657:1479488984697667654> Estou verificando algumas informações.`,
                flags: [64]
            });

            try {
                const self = new Client();
                await self.login(token);
                await self.destroy();
            } catch (err) {
                console.error("[CONFIG] Token inválido:", err.message);
                return interaction.editReply({
                    content: `\`❌\` Token inválido.\n-# Não passe para ninguem o seu token e mantenha em segurança.`
                });
            }

            if (mentionautoNumber) {
                const mentionauto = parseFloat(mentionautoNumber.replace(",", "."));
                if (isNaN(mentionauto)) return interaction.editReply({
                    content: `\`❌\` Coloque apenas números na Menção Automatica.`
                });
                if (mentionauto < 1) return interaction.editReply({
                    content: `\`❌\` Coloque apenas numeros acima de \`1 Segundo.\``
                });
                await us.set(`${user.id}.mentionauto`, mentionauto);
            } else {
                await us.set(`${user.id}.mentionauto`, false);
            }



            await us.set(`${user.id}.token`, token);
            await us.set(`${user.id}.msgauto`, msgauto);

            interaction.editReply({
                content: `<:emoji:1488571380738818080> Configurações alteradas com sucesso.`
            });
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// AUTOMAÇÃO DE FILAS
// ═══════════════════════════════════════════════════════════════════════════

async function startQueueAutomation(interaction, user, format, category, client) {
    try {
        const userData = await us.get(`${user.id}`);

        if (!userData?.token) {
            return interaction.editReply({ content: `\`❌\` Token não configurado.` });
        }

        // Destruir automação anterior se existir
        if (verify[user.id]) {
            const v = verify[user.id];
            try { v.client.destroy(); } catch (e) { console.error("[CLEANUP] Erro ao destruir client anterior:", e.message); }
            try { clearInterval(v.interval); } catch (e) { console.error("[CLEANUP] Erro ao limpar interval:", e.message); }
            if (v.timeout) try { clearTimeout(v.timeout); } catch (e) { console.error("[CLEANUP] Erro ao limpar timeout:", e.message); }
        }

        // ═══════════════════════════════════════════════════════════════
        // MAPEAMENTO DE CATEGORIAS PARA BUSCA DE CANAIS
        // ═══════════════════════════════════════════════════════════════
        const categoriaMap = {
            mobile: "mob",
            emulador: "emu",
            misto: "misto",
            tatico: "tatico"
        };

        const categoriaSearch = categoriaMap[category];
        if (!categoriaSearch) {
            return interaction.editReply({ content: `\`❌\` Categoria inválida: ${category}` });
        }

        // Formato para busca: "1v1" → "1x1"
        const formatSearch = format.replace("v", "x").toLowerCase();

        console.log(`[AUTOMAÇÃO] Iniciando: formato=${formatSearch}, categoria=${categoriaSearch}`);

        // ═══════════════════════════════════════════════════════════════
        // CONTADORES POR SERVIDOR
        // ═══════════════════════════════════════════════════════════════
        const guildClickCount = new Map();
        const clickedMessages = new Set();

        const getGuildClicks = (guildId) => guildClickCount.get(guildId) || 0;
        const addGuildClick = (guildId) => {
            const current = getGuildClicks(guildId);
            guildClickCount.set(guildId, current + 1);
            return current + 1;
        };
        const isGuildFull = (guildId) => getGuildClicks(guildId) >= MAX_ENTRIES_PER_GUILD;

        // ═══════════════════════════════════════════════════════════════
        // SISTEMA DE LOGS DETALHADOS
        // ═══════════════════════════════════════════════════════════════
        const logs = { encontrados: [], ignorados: [], entradas: [], confirmados: [], erros: [] };

        const updateLogEmbed = (debugMsg) => {
            const logText = [
                "**<:lubabemloko:1488570810401554463> Canais Encontrados**",
                logs.encontrados.length > 0 ? logs.encontrados.join("\n") : "Nenhum",
                "",
                "**<:emoji:1488571380738818080> Filas Entradas**",
                logs.entradas.length > 0 ? logs.entradas.join("\n") : "Nenhuma",
                "",
                "**<:_Seta:1488072811472879687> Filas Confirmadas**",
                logs.confirmados.length > 0 ? logs.confirmados.join("\n") : "Nenhuma",
                "",
                debugMsg ? `**🔍 Debug:**\n${debugMsg}` : ""
            ].join("\n");

            interaction.editReply({
                embeds: [new EmbedBuilder().setColor("Green").setTitle("📊 Logs da Automação").setDescription(logText.substring(0, 4000))]
            }).catch(err => console.error("[LOG] Erro ao atualizar embed:", err.message));
        };

        // ═══════════════════════════════════════════════════════════════
        // LOGIN DO SELFBOT
        // ═══════════════════════════════════════════════════════════════
        const self = new Client();
        await self.login(userData.token);
                

        // ═══════════════════════════════════════════════════════════════
        // BUSCA DE CANAIS
        // Filtro: nome do canal deve conter o formato E a categoria
        // Ex: "1x1-mob", "2x2-emu", "3x3-misto", "4x4-tatico"
        // ═══════════════════════════════════════════════════════════════
        const canais = self.channels.cache.filter(c => {
            if (c.type !== "GUILD_TEXT") return false;
            const nome = c.name.toLowerCase();
            const matchFormato = nome.includes(formatSearch);
            const matchCategoria = nome.includes(categoriaSearch);

            if (matchFormato && matchCategoria) {
                
                return true;
            }

            // Log de canais que quase matcharam (debug)
            if (matchFormato || matchCategoria) {
                
            }

            return false;
        });

        if (canais.size < 1) {
            
            self.destroy();
            return interaction.editReply({
                content: `\`❌\` Nenhum canal encontrado para \`${formatSearch}\` + \`${categoriaSearch}\`.\nVerifique se os canais seguem o padrão: \`${formatSearch}-${categoriaSearch}\``
            });
        }

        canais.forEach(c => {
            const guildName = c.guild?.name || "?";
            logs.encontrados.push(`<#${c.id}> (${guildName})`);
        });
        updateLogEmbed(`Buscando filas em ${canais.size} canais...`);

        // ═══════════════════════════════════════════════════════════════
        // LISTA DE BOTÕES IGNORADOS
        // ═══════════════════════════════════════════════════════════════
        const IGNORED_BUTTONS = ["leave_player", "cancelar", "fechar", "finalizar", "recusar", "sair"];

        const isIgnoredButton = (button) => {
            if (!button.customId) return true;
            if (IGNORED_BUTTONS.includes(button.customId.toLowerCase())) return true;
            if (button.label && IGNORED_BUTTONS.includes(button.label.toLowerCase())) return true;
            return false;
        };

        // ═══════════════════════════════════════════════════════════════
        // IDENTIFICAÇÃO DO BOTÃO CORRETO
        // Analisa customId, label e emoji para encontrar o botão
        // que corresponde à categoria selecionada
        // ═══════════════════════════════════════════════════════════════
        const CATEGORY_KEYWORDS = {
            mobile: ["mobile", "mob", "celular", "📱"],
            emulador: ["emulador", "emu", "emul", "🖥️", "🖥"],
            misto: ["misto", "mis", "mix", "🕹️", "🕹"],
            tatico: ["tatico", "tático", "tat", "❗"]
        };

        const findCorrectButton = (buttons, category) => {
            const keywords = CATEGORY_KEYWORDS[category];
            if (!keywords) return null;

            

            let bestMatch = null;

            for (const button of buttons) {
                if (isIgnoredButton(button)) {
                    
                    continue;
                }

                const customIdLower = (button.customId || "").toLowerCase();
                const labelLower = (button.label || "").toLowerCase()
                    .normalize("NFD").replace(/\p{Diacritic}/gu, "");
                const emojiName = button.emoji?.name || "";
                const emojiStr = button.emoji ? (button.emoji.id ? `<:${button.emoji.name}:${button.emoji.id}>` : button.emoji.name) : "";

                const searchText = `${customIdLower} ${labelLower} ${emojiName} ${emojiStr}`.toLowerCase();

                

                for (const keyword of keywords) {
                    if (searchText.includes(keyword.toLowerCase())) {
                        
                        bestMatch = button;
                        break;
                    }
                }

                if (bestMatch) break;
            }

            // Se não encontrou por keywords da categoria, tentar join_player genérico
            if (!bestMatch) {
                const joinButton = buttons.find(b => 
                    b.customId === "join_player" || 
                    b.customId?.toLowerCase().includes("join") ||
                    b.customId?.toLowerCase().includes("entrar")
                );
                if (joinButton && !isIgnoredButton(joinButton)) {
                    
                    bestMatch = joinButton;
                }
            }

            if (!bestMatch) {
                
            }

            return bestMatch;
        };

        // ═══════════════════════════════════════════════════════════════
        // FUNÇÃO DE CLIQUE COM CONTROLE POR SERVIDOR
        // ═══════════════════════════════════════════════════════════════
        const tryClickButton = async (msg, button, channel, debugLabel) => {
            const guildId = channel.guild?.id;
            const guildName = channel.guild?.name || "?";

            if (!guildId) {
                
                return false;
            }
            if (isGuildFull(guildId)) {
                
                return false;
            }
            if (clickedMessages.has(msg.id)) {
                
                return false;
            }

            try {
                
                await msg.clickButton(button.customId);
                clickedMessages.add(msg.id);
                const totalClicks = addGuildClick(guildId);

                const logEntry = `<#${channel.id}> (${guildName}) [${totalClicks}/${MAX_ENTRIES_PER_GUILD}]`;
                logs.entradas.push(logEntry);
                updateLogEmbed(`${debugLabel}\nServidor: ${guildName}\nCanal: #${channel.name}\nBotão: "${button.label || button.customId}"\nCliques: ${totalClicks}/${MAX_ENTRIES_PER_GUILD}${totalClicks >= MAX_ENTRIES_PER_GUILD ? "\n⚠️ LIMITE ATINGIDO neste servidor" : ""}`);

                
                return true;
            } catch (err) {
                
                logs.erros.push(`#${channel.name}: ${err.message}`);
                return false;
            }
        };

        // ═══════════════════════════════════════════════════════════════
        // PROCESSAR UM CANAL
        // Busca mensagens, analisa botões, clica no correto
        // ═══════════════════════════════════════════════════════════════
        const processChannel = async (channel) => {
            const guildId = channel.guild?.id;
            if (!guildId) return;
            if (isGuildFull(guildId)) return;

            try {
                
                const msgs = await channel.messages.fetch({ limit: 15 });
                

                for (const msg of msgs.values()) {
                    if (isGuildFull(guildId)) {
                        
                        break;
                    }
                    if (!msg.components?.length) continue;
                    if (clickedMessages.has(msg.id)) continue;

                    

                    // Coletar todos os botões da mensagem
                    const allButtons = [];
                    for (const row of msg.components) {
                        for (const component of row.components) {
                            if (component.type === "BUTTON" || component.customId) {
                                allButtons.push(component);
                            }
                        }
                    }

                    

                    if (allButtons.length === 0) continue;

                    // Encontrar o botão correto para a categoria
                    const correctButton = findCorrectButton(allButtons, category);

                    if (correctButton) {
                        const clicked = await tryClickButton(msg, correctButton, channel, 
                            `Botão "${correctButton.label || correctButton.customId}" identificado para ${category}`);
                        if (clicked) {
                            // Clicou com sucesso, não clicar em mais botões desta mensagem
                            // Mas continuar para outras mensagens no canal (até o limite)
                            continue;
                        }
                    } else {
                        
                    }
                }
            } catch (err) {
                
            }
        };

        // ═══════════════════════════════════════════════════════════════
        // FUNÇÃO DE VALIDAÇÃO DE PERMISSÃO DE ENVIO
        // ═══════════════════════════════════════════════════════════════
        const canSendMsg = async (channel) => {
            try {
                if (!channel || channel.type !== "GUILD_TEXT") return false;
                if (!channel.viewable) return false;
                const guild = channel.guild;
                if (!guild) return false;
                const member = await guild.members.fetchMe().catch(() => null);
                if (!member) return false;
                const permissions = member.permissionsIn(channel);
                if (!permissions.has("SEND_MESSAGES")) return false;
                return true;
            } catch (err) {
                return false;
            }
        };

        // ═══════════════════════════════════════════════════════════════
        // INTERVALO DE MONITORAMENTO CONTÍNUO (a cada 2s)
        // PARTE 1: Rebusca canais de fila para novos cliques
        // PARTE 2: Monitora canais de partida (msgauto + confirmação + menção)
        //
        // IMPORTANTE: msgauto usa cache EM MEMÓRIA (não persistente)
        // Isso garante que a cada nova sessão da automação, as mensagens
        // serão enviadas novamente nos canais novos.
        // ═══════════════════════════════════════════════════════════════
        const processing = new Set();
        const msgAutoSentThisSession = new Set(); // Cache EM MEMÓRIA - reseta a cada sessão
        const activeTasks = new Set(); // Tarefas independentes agendadas

        const interval = setInterval(async () => {
            try {
                // ─── PARTE 1: Rebuscar canais de fila para novos cliques ───
                const newQueueChannels = self.channels.cache.filter(c => {
                    if (c.type !== "GUILD_TEXT") return false;
                    const nome = c.name.toLowerCase();
                    return nome.includes(formatSearch) && nome.includes(categoriaSearch);
                });

                for (const [, channel] of newQueueChannels) {
                    const guildId = channel.guild?.id;
                    if (!guildId) continue;
                    if (isGuildFull(guildId)) continue;
                    if (processing.has(channel.id)) continue;
                    processing.add(channel.id);

                    try {
                        await processChannel(channel);
                    } catch (err) {
                        
                    }

                    // Resetar contador de cliques deste servidor para permitir novo ciclo
                    if (guildId && isGuildFull(guildId)) {
                        guildClickCount.delete(guildId);
                    }

                    setTimeout(() => processing.delete(channel.id), 3000);
                }

                // ─── PARTE 2: Monitorar canais de partida/aguardando ───
                // Busca canais com "aguardando"/"Aguardando"/"partida"/"Partida"/"fila"/"Fila" no nome
                // Esses são canais criados pelo bot de fila após o match
                const chns = self.channels.cache.filter(channel =>
                    channel.guild &&
                    (channel.type === "GUILD_TEXT" || channel.type === "GUILD_PRIVATE_THREAD") &&
                    (channel.name?.toLowerCase().includes("aguardando") || 
                     channel.name?.toLowerCase().includes("Aguardando") || 
                     channel.name?.toLowerCase().includes("partida") || 
                     channel.name?.toLowerCase().includes("Partida") || 
                     channel.name?.toLowerCase().includes("fila") || 
                     channel.name?.toLowerCase().includes("Fila")) &&
                    channel.viewable
                );

                for (const [, channel] of chns) {
                    if (processing.has(channel.id)) continue;
                    processing.add(channel.id);
                    let mentionWait = 1000;

                    try {
                        const userData = await us.get(`${user.id}`);
                        const msgs = await channel.messages.fetch({ limit: 5 });
                        const firstMsg = msgs.find(m => m.components?.length);

                        // ─── MENSAGEM AUTOMÁTICA (TAREFA INDEPENDENTE) ───
                        if (userData?.msgauto && !msgAutoSentThisSession.has(channel.id)) {
                            msgAutoSentThisSession.add(channel.id);
                            const taskMsg = (async () => {
                                try {
                                    const msgDelaySec = parseInt(userData.msgdelay) || 0;
                                    if (msgDelaySec > 0) {
                                        await new Promise(res => setTimeout(res, msgDelaySec * 1000));
                                    }
                                    await channel.send(userData.msgauto);
                                    console.log(`📩 Mensagem enviada | #${channel.name}`);
                                } catch (err) {
                                    
                                }
                            })();
                            activeTasks.add(taskMsg);
                            taskMsg.finally(() => activeTasks.delete(taskMsg));
                        }

                        // Se não tem mensagem com componentes, pula confirmação e menção
                        if (!firstMsg) {
                            setTimeout(() => processing.delete(channel.id), 2000);
                            continue;
                        }

                        mentionWait = (userData?.mentionauto || 1) * 1000;



                        // ─── MENÇÃO AUTOMÁTICA (TAREFA INDEPENDENTE) ───
                        if (userData?.mentionauto) {
                            const mencoesKey = `${self.user.id}.mentionauto.${channel.id}`;
                            const lastMsgKey = `${self.user.id}.mentionauto.lastMsg.${channel.id}`;
                            const lockKey = `${self.user.id}.mentionauto.lock.${channel.id}`;
                            const mencoesFeitas = (await lg.get(mencoesKey)) || 0;
                            const lastMsgId = await lg.get(lastMsgKey);
                            const locked = await lg.get(lockKey);

                            if (locked) { setTimeout(() => processing.delete(channel.id), Math.max(2000, mentionWait + 1000)); continue; }
                            if (mencoesFeitas >= 1) { setTimeout(() => processing.delete(channel.id), Math.max(2000, mentionWait + 1000)); continue; }
                            if (lastMsgId && lastMsgId === firstMsg.id) { setTimeout(() => processing.delete(channel.id), Math.max(2000, mentionWait + 1000)); continue; }

                            const taskMention = (async () => {
                                try {
                                    await new Promise(res => setTimeout(res, userData.mentionauto * 1000));

                                    let foundMentions = [];

                                    const contentMentions = [...(firstMsg.content || "").matchAll(/<@!?(\d+)>/g)]
                                        .map(m => m[1])
                                        .filter(id => id !== self.user.id);
                                    foundMentions.push(...contentMentions);

                                    for (const embed of firstMsg.embeds) {
                                        if (embed.description) {
                                            const descMentions = [...embed.description.matchAll(/<@!?(\d+)>/g)]
                                                .map(m => m[1])
                                                .filter(id => id !== self.user.id);
                                            foundMentions.push(...descMentions);
                                        }
                                        if (embed.fields?.length) {
                                            for (const field of embed.fields) {
                                                const fieldMentions = [...field.value.matchAll(/<@!?(\d+)>/g)]
                                                    .map(m => m[1])
                                                    .filter(id => id !== self.user.id);
                                                foundMentions.push(...fieldMentions);
                                            }
                                        }
                                    }

                                    foundMentions = [...new Set(foundMentions)];

                                    for (const mentionUserId of foundMentions) {
                                        try {
                                            const member = await channel.guild.members.fetch(mentionUserId);
                                            if (!member.permissions.has("MANAGE_MESSAGES")) {
                                                await lg.set(lockKey, true);
                                                const lockT = setTimeout(() => lg.set(lockKey, false).catch(e => console.error("[LOCK]", e.message)), Math.max(7000, mentionWait + 5000));

                                                try {
                                                    await channel.send({ content: `<@${mentionUserId}>` });
                                                    await lg.set(mencoesKey, mencoesFeitas + 1);
                                                    await lg.set(lastMsgKey, firstMsg.id);
                                                    console.log(`📢 Menção enviada | #${channel.name}`);
                                                } catch (err) {
                                                    
                                                }
                                                await lg.set(lockKey, false);
                                                clearTimeout(lockT);
                                                break;
                                            }
                                        } catch (err) {
                                            
                                        }
                                    }
                                } catch (err) {
                                    
                                }
                            })();
                            activeTasks.add(taskMention);
                            taskMention.finally(() => activeTasks.delete(taskMention));
                        }
                    } catch (err) {
                        
                    }

                    setTimeout(() => processing.delete(channel.id), Math.max(2000, mentionWait + 1000));
                }

                // Limpar mensagens clicadas ao final de cada tick para permitir novo ciclo
                clickedMessages.clear();
            } catch (err) {
                
            }
        }, 2000);

        // SEM TIMEOUT - AUTOMAÇÃO CONTÍNUA
        // BUSCA INICIAL
        // Processa todos os canais encontrados na primeira varredura
        // ═══════════════════════════════════════════════════════════════
        

        for (const channel of canais.values()) {
            const guildId = channel.guild?.id;
            if (guildId && isGuildFull(guildId)) {
                
                continue;
            }
            await processChannel(channel);
        }

                
        verify[user.id] = { client: self, interval };
    } catch (err) {
        console.error("[AUTOMAÇÃO] Erro fatal:", err);
        interaction.editReply({ content: `\`❌\` Erro: ${err.message}` }).catch(() => {});
        const v = verify[user.id];
        if (v) {
            try { v.client.destroy(); } catch (e) { console.error("[CLEANUP]", e.message); }
            try { clearInterval(v.interval); } catch (e) { console.error("[CLEANUP]", e.message); }
            if (v.timeout) try { clearTimeout(v.timeout); } catch (e) { console.error("[CLEANUP]", e.message); }
        }
    }
}
