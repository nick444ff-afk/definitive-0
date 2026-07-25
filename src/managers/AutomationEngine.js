const { Client } = require('discord.js-selfbot-v13');

/**
 * AutomationEngine - LÓGICA INTEGRADA E REFINADA
 * Mantém a estrutura de loop contínuo da versão atual,
 * mas restaura as funcionalidades de Mensagem Automática, Menção Automática e Confirmação Automática do commit antigo.
 */
class AutomationEngine {
    constructor() {
        this.activeAutomations = new Map();
        this.MAX_ENTRIES_PER_GUILD = 1;
    }

    async startAutomation(botId, config, onLog, onStats) {
        try {
            if (this.activeAutomations.has(botId)) {
                onLog("⚠️ Automação já em execução para este bot", "warn");
                return false;
            }

            const { tokens } = config;
            if (!tokens || tokens.length === 0) {
                onLog("❌ Nenhum token fornecido", "error");
                return false;
            }

            const automation = {
                isRunning: true,
                clients: [],
                activeTasks: new Set(),
                processing: new Set(),
                clickedMessages: new Set(),
                guildClickCount: new Map(),
                msgAutoSentThisSession: new Set(), // Restaurado do commit antigo
                confirmedChannels: new Set(), // Restaurado do commit antigo
                lastClickTime: 0, // Restaurado do commit antigo
                onLog,
                onStats
            };

            this.activeAutomations.set(botId, automation);

            // Iniciar processamento para cada token
            for (const token of tokens) {
                this._processToken(botId, automation, token, config).catch(err => {
                    onLog(`❌ Erro no token ${token.substring(0, 10)}...: ${err.message}`, "error");
                });
            }

            return true;
        } catch (err) {
            onLog(`❌ Erro fatal ao iniciar automação: ${err.message}`, "error");
            return false;
        }
    }

    async _processToken(botId, automation, token, config) {
        const { onLog, onStats } = automation;
        const { categories, modos, msgauto, mentionauto, confirmauto, msgdelay } = config;

        try {
            const self = new Client();
            
            self.on('error', (err) => onLog(`⚠️ Erro no Client: ${err.message}`, "warn"));
            
            await self.login(token);
            automation.clients.push(self);
            onLog(`✅ Logado como: ${self.user.tag}`, "success");

            const categoriaMap = {
                mobile: "mob",
                emulador: "emu",
                misto: "misto",
                tatico: "tatico"
            };

            const searchFormats = (modos || []).map(m => m.toLowerCase().replace("v", "x"));
            const searchCategories = (categories || []).map(cat => categoriaMap[cat.toLowerCase()] || cat.toLowerCase());

            const CATEGORY_KEYWORDS = {
                mobile: ["mobile", "mob", "celular", "📱"],
                emulador: ["emulador", "emu", "emul", "🖥️", "🖥"],
                misto: ["misto", "mis", "mix", "🕹️", "🕹"],
                tatico: ["tatico", "tático", "tat", "❗"]
            };

            const IGNORED_BUTTONS = ["leave_player", "cancelar", "fechar", "finalizar", "recusar", "sair"];

            const findCorrectButton = (buttons, activeCategories) => {
                let bestMatch = null;
                for (const cat of activeCategories) {
                    const keywords = CATEGORY_KEYWORDS[cat.toLowerCase()] || [cat.toLowerCase()];
                    for (const button of buttons) {
                        if (IGNORED_BUTTONS.includes(button.customId?.toLowerCase())) continue;
                        if (button.label && IGNORED_BUTTONS.includes(button.label.toLowerCase())) continue;

                        const searchText = `${button.customId} ${button.label} ${button.emoji?.name}`.toLowerCase();
                        if (keywords.some(kw => searchText.includes(kw.toLowerCase()))) {
                            bestMatch = button;
                            break;
                        }
                    }
                    if (bestMatch) break;
                }

                if (!bestMatch) {
                    bestMatch = buttons.find(b => 
                        b.customId === "join_player" || 
                        b.customId?.toLowerCase().includes("join") ||
                        b.customId?.toLowerCase().includes("entrar")
                    );
                }
                return bestMatch;
            };

            const processServer = async (guild, queueChannels, partidaChannels) => {
                const guildId = guild.id;
                
                // 1. PROCESSAR CANAIS DE FILA (ENTRADAS)
                for (const channel of queueChannels.values()) {
                    if (!automation.isRunning) break;
                    const currentClicks = automation.guildClickCount.get(guildId) || 0;
                    if (currentClicks >= this.MAX_ENTRIES_PER_GUILD) break;

                    try {
                        const msgs = await channel.messages.fetch({ limit: 15 });
                        for (const msg of msgs.values()) {
                            if (!automation.isRunning) break;
                            if ((automation.guildClickCount.get(guildId) || 0) >= this.MAX_ENTRIES_PER_GUILD) break;
                            if (!msg.components?.length || automation.clickedMessages.has(msg.id)) continue;

                            const allButtons = [];
                            for (const row of msg.components) {
                                for (const component of row.components) {
                                    if (component.type === "BUTTON" || component.customId) allButtons.push(component);
                                }
                            }

                            const correctButton = findCorrectButton(allButtons, categories);

                            if (correctButton) {
                                try {
                                    const now = Date.now();
                                    const timeSinceLastClick = now - (automation.lastClickTime || 0);
                                    const baseDelay = 2000;
                                    const jitter = Math.random() * 1500;
                                    const targetDelay = baseDelay + jitter;

                                    if (timeSinceLastClick < targetDelay) {
                                        await new Promise(res => setTimeout(res, targetDelay - timeSinceLastClick));
                                    }
                                    automation.lastClickTime = Date.now();

                                    const newCount = (automation.guildClickCount.get(guildId) || 0) + 1;
                                    automation.guildClickCount.set(guildId, newCount);
                                    
                                    await msg.clickButton(correctButton.customId);
                                    automation.clickedMessages.add(msg.id);
                                    
                                    onLog(`✅ Entrada realizada em #${channel.name} (${guild.name}) [${newCount}/${this.MAX_ENTRIES_PER_GUILD}]`, "success");
                                    if (onStats) onStats({ entradas: [...automation.guildClickCount.values()].reduce((a, b) => a + b, 0) });
                                    
                                    if (newCount >= this.MAX_ENTRIES_PER_GUILD) break;
                                } catch (err) {
                                    onLog(`❌ Erro ao clicar em #${channel.name}: ${err.message}`, "error");
                                }
                            }
                        }
                    } catch (err) {}
                }

                // 2. PROCESSAR CANAIS DE PARTIDA (MSG AUTO, CONFIRMAÇÃO, MENÇÃO) - LÓGICA RESTAURADA
                for (const channel of partidaChannels.values()) {
                    if (!automation.isRunning) break;
                    if (automation.processing.has(channel.id)) continue;
                    automation.processing.add(channel.id);

                    try {
                        // --- MENSAGEM AUTOMÁTICA (RESTORED) ---
                        if (msgauto && !automation.msgAutoSentThisSession.has(channel.id)) {
                            try {
                                const msgDelaySec = parseInt(msgdelay) || 0;
                                if (msgDelaySec > 0) {
                                    onLog(`[MSG-AUTO] ⏳ Aguardando ${msgDelaySec}s para enviar mensagem em #${channel.name}`, "info");
                                    await new Promise(res => setTimeout(res, msgDelaySec * 1000));
                                }
                                
                                if (automation.isRunning) {
                                    await channel.sendTyping();
                                    const typingTime = 2000 + Math.random() * 3000;
                                    await new Promise(res => setTimeout(res, typingTime));

                                    if (automation.isRunning) {
                                        await channel.send(msgauto);
                                        automation.msgAutoSentThisSession.add(channel.id);
                                        onLog(`[MSG-AUTO] ✅ Enviada em #${channel.name}`, "success");
                                    }
                                }
                            } catch (e) {
                                onLog(`[MSG-AUTO] ❌ Erro em #${channel.name}: ${e.message}`, "error");
                                automation.msgAutoSentThisSession.add(channel.id);
                            }
                        }

                        const msgs = await channel.messages.fetch({ limit: 5 });
                        const firstMsg = msgs.find(m => m.components?.length);

                        if (firstMsg) {
                            // --- CONFIRMAÇÃO AUTOMÁTICA (RESTORED) ---
                            if (confirmauto > 0 && !automation.confirmedChannels.has(channel.id)) {
                                await new Promise(res => setTimeout(res, confirmauto * 1000));
                                let confirmed = false;
                                for (const row of firstMsg.components) {
                                    for (const button of row.components) {
                                        if (confirmed) continue;
                                        if (!button.customId || IGNORED_BUTTONS.includes(button.label?.toLowerCase())) continue;
                                        if (button.customId === "leave_player") continue;

                                        try {
                                            await firstMsg.clickButton(button.customId);
                                            confirmed = true;
                                            automation.confirmedChannels.add(channel.id);
                                            onLog(`[CONFIRM] ✅ Confirmado em #${channel.name}`, "success");
                                        } catch (err) {
                                            onLog(`[CONFIRM] ❌ Erro em #${channel.name}: ${err.message}`, "error");
                                        }
                                    }
                                }
                            }

                            // --- MENÇÃO AUTOMÁTICA (RESTORED) ---
                            if (mentionauto > 0) {
                                const mentionKey = `mention_${channel.id}_${firstMsg.id}`;
                                if (!automation.clickedMessages.has(mentionKey)) {
                                    await new Promise(res => setTimeout(res, mentionauto * 1000));
                                    
                                    let foundMentions = [];
                                    const regex = /<@!?(\d+)>/g;
                                    
                                    const contentMentions = [...(firstMsg.content || "").matchAll(regex)].map(m => m[1]);
                                    foundMentions.push(...contentMentions);
                                    
                                    for (const embed of firstMsg.embeds) {
                                        if (embed.description) foundMentions.push(...[...embed.description.matchAll(regex)].map(m => m[1]));
                                        if (embed.fields) embed.fields.forEach(f => foundMentions.push(...[...f.value.matchAll(regex)].map(m => m[1])));
                                    }
                                    
                                    foundMentions = [...new Set(foundMentions)].filter(id => id !== self.user.id);
                                    
                                    for (const mentionUserId of foundMentions) {
                                        try {
                                            const member = await channel.guild.members.fetch(mentionUserId);
                                            if (!member.permissions.has("MANAGE_MESSAGES")) {
                                                await channel.send(`<@${mentionUserId}>`);
                                                automation.clickedMessages.add(mentionKey);
                                                onLog(`[MENÇÃO] ✅ Mencionou <@${mentionUserId}> em #${channel.name}`, "success");
                                                break;
                                            }
                                        } catch (e) {}
                                    }
                                }
                            }
                        }
                    } catch (err) {}
                    setTimeout(() => automation.processing.delete(channel.id), 2000);
                }
            };

            // LOOP INFINITO - PERCORRE TODOS OS SERVIDORES CONTINUAMENTE
            let serverIndex = 0;
            while (automation.isRunning) {
                try {
                    const guilds = self.guilds.cache.filter(g => !g.unavailable);
                    const guildArray = [...guilds.values()];
                    if (guildArray.length === 0) {
                        await new Promise(res => setTimeout(res, 5000));
                        continue;
                    }

                    serverIndex = serverIndex % guildArray.length;
                    const currentGuild = guildArray[serverIndex];

                    const queueChannels = currentGuild.channels.cache.filter(c => {
                        if (c.type !== "GUILD_TEXT") return false;
                        const nome = c.name.toLowerCase();
                        const matchesFormat = searchFormats.length === 0 || searchFormats.some(f => nome.includes(f));
                        const matchesCategory = searchCategories.length === 0 || searchCategories.some(cat => nome.includes(cat));
                        return matchesFormat && matchesCategory;
                    });

                    const partidaChannels = currentGuild.channels.cache.filter(channel =>
                        (channel.type === "GUILD_TEXT" || channel.type === "GUILD_PRIVATE_THREAD") &&
                        channel.viewable &&
                        (channel.name?.toLowerCase().includes("aguardando") ||
                         channel.name?.toLowerCase().includes("partida") ||
                         channel.name?.toLowerCase().includes("fila"))
                    );

                    await processServer(currentGuild, queueChannels, partidaChannels);

                    const gid = currentGuild.id;
                    automation.guildClickCount.delete(gid);

                    serverIndex++;
                    await new Promise(res => setTimeout(res, 1000 + Math.random() * 1000));
                } catch (err) {
                    onLog(`⚠️ Erro no loop principal: ${err.message}`, "warn");
                    await new Promise(res => setTimeout(res, 3000));
                }
            }
        } catch (err) {
            onLog(`❌ Erro no processamento do token: ${err.message}`, "error");
        }
    }

    async stopAutomation(botId, onLog) {
        const automation = this.activeAutomations.get(botId);
        if (!automation) return false;

        automation.isRunning = false;
        if (automation.activeTasks.size > 0) {
            onLog("⏳ Aguardando tarefas pendentes finalizarem...", "info");
            await Promise.allSettled([...automation.activeTasks]);
        }

        for (const client of automation.clients) {
            try { await client.destroy(); } catch (e) {}
        }

        this.activeAutomations.delete(botId);
        if (onLog) onLog("⚠️ Automação parada com sucesso", "warn");
        return true;
    }
}

module.exports = new AutomationEngine();
