const { Client } = require('discord.js-selfbot-v13');

/**
 * AutomationEngine - LÓGICA INTEGRADA E REFINADA
 * Extraída do commit fd71344f8f267f519f2b41874e10f18949536399
 * FIX: Tratamento robusto de erros 50013 (Missing Permissions)
 */
class AutomationEngine {
    constructor() {
        this.activeAutomations = new Map();
        this.MAX_ENTRIES_PER_GUILD = 1;
    }

    async startAutomation(botId, config, onLog, onStats) {
        try {
            if (this.activeAutomations.has(botId)) {
                return false;
            }

            const { tokens } = config;
            if (!tokens || tokens.length === 0) {
                return false;
            }

            const automation = {
                isRunning: true,
                clients: [],
                intervals: [],
                processing: new Set(),
                clickedMessages: new Set(),
                guildClickCount: new Map(),
                msgAutoSentThisSession: new Set(),
                confirmedChannels: new Set(),
                lastClickTime: 0,
                activeTasks: new Set(),
                onLog,
                onStats
            };

            this.activeAutomations.set(botId, automation);

            // Iniciar para cada token
            for (const token of tokens) {
                if (!automation.isRunning) break;
                this._runOriginalLogic(botId, automation, token, config).catch(err => {
                    onLog(`❌ Erro crítico no token ${token.substring(0, 10)}...: ${err.message}`, "error");
                });
            }

            return true;
        } catch (err) {
            onLog(`❌ Erro fatal ao iniciar automação: ${err.message}`, "error");
            return false;
        }
    }

    async _runOriginalLogic(botId, automation, token, config) {
        const { onLog, onStats } = automation;
        const { categories, modos, msgauto, mentionauto, confirmauto, msgdelay } = config;

        try {
            const self = new Client();
            
            self.on('error', (err) => {});
            self.on('disconnect', () => {});

            await self.login(token);
            automation.clients.push(self);
            

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

            // Helper: identificar erro de permissão do Discord
            const isPermissionError = (err) => {
                return err && (err.code === 50013 || err.httpStatus === 403);
            };

            const processChannel = async (channel) => {
                const guildId = channel.guild?.id;
                if (!guildId || !automation.isRunning) return;
                
                const currentClicks = automation.guildClickCount.get(guildId) || 0;
                if (currentClicks >= this.MAX_ENTRIES_PER_GUILD) return;

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
                                if (timeSinceLastClick < 1000) {
                                    const waitTime = 1000 - timeSinceLastClick;
                                    await new Promise(res => setTimeout(res, waitTime));
                                }
                                automation.lastClickTime = Date.now();

                                const newCount = (automation.guildClickCount.get(guildId) || 0) + 1;
                                automation.guildClickCount.set(guildId, newCount);
                                
                                await msg.clickButton(correctButton.customId);
                                automation.clickedMessages.add(msg.id);
                                
                                onLog(`✅ Botão clicado | ${channel.guild.name} | #${channel.name}`, "success");
                                if (onStats) onStats({ entradas: [...automation.guildClickCount.values()].reduce((a, b) => a + b, 0) });
                                
                                if (newCount >= this.MAX_ENTRIES_PER_GUILD) break;
                            } catch (err) {
                                // FIX: Tratar erro de permissão sem derrubar o processo
                                if (isPermissionError(err)) {
                                    onLog(`⚠️ Sem permissão para clicar neste botão | ${channel.guild.name} | #${channel.name}`, "warn");
                                }
                                // Outros erros também são ignorados silenciosamente
                            }
                        }
                    }
                } catch (err) {
                    // Erro ao fetchar mensagens - ignorar e continuar
                }
            };

                        // ═══════════════════════════════════════════════════════════
            // LOOP CONTÍNUO INFINITO
            // ═══════════════════════════════════════════════════════════
            let serverIndex = 0;

            while (true) {
                if (!automation.isRunning) break;
                try {
                    const guilds = self.guilds.cache.filter(g => !g.unavailable);
                    const guildArray = [...guilds.values()];

                    if (guildArray.length === 0) {
                        await new Promise(res => setTimeout(res, 5000));
                        continue;
                    }

                    serverIndex = serverIndex % guildArray.length;
                    const currentGuild = guildArray[serverIndex];

                    // 1. ESCANEAMENTO DE CANAIS DE FILA
                    const canaisFila = currentGuild.channels.cache.filter(c => {
                        if (c.type !== "GUILD_TEXT") return false;
                        const nome = c.name.toLowerCase();
                        const matchesFormat = searchFormats.length === 0 || searchFormats.some(f => nome.includes(f));
                        const matchesCategory = searchCategories.length === 0 || searchCategories.some(cat => nome.includes(cat));
                        return matchesFormat && matchesCategory;
                    });

                    for (const [, channel] of canaisFila) {
                        if (!automation.isRunning) break;
                        if (automation.processing.has(channel.id)) continue;
                        
                        const guildId = channel.guild?.id;
                        if (guildId && (automation.guildClickCount.get(guildId) || 0) >= this.MAX_ENTRIES_PER_GUILD) continue;

                        automation.processing.add(channel.id);
                        try {
                            await processChannel(channel);
                        } catch (err) {
                            // Garantir que erro no processChannel não pare o loop
                            if (isPermissionError(err)) {
                                onLog(`⚠️ Sem permissão neste canal | #${channel.name}`, "warn");
                            }
                        }
                        setTimeout(() => automation.processing.delete(channel.id), 500);
                    }

                    // 2. MONITORAMENTO DE PARTIDAS (MSG AUTO, CONFIRMAÇÃO, MENÇÃO)
                    const canaisPartida = currentGuild.channels.cache.filter(channel =>
                        (channel.type === "GUILD_TEXT" || channel.type === "GUILD_PRIVATE_THREAD") &&
                        (channel.name?.toLowerCase().includes("aguardando") || 
                         channel.name?.toLowerCase().includes("partida") || 
                         channel.name?.toLowerCase().includes("fila")) &&
                        channel.viewable
                    );

                    for (const [, channel] of canaisPartida) {
                        if (!automation.isRunning) break;
                        if (automation.processing.has(channel.id)) continue;
                        automation.processing.add(channel.id);

                        try {
                            // --- MENSAGEM AUTOMÁTICA (TAREFA INDEPENDENTE) ---
                            if (msgauto && !automation.msgAutoSentThisSession.has(channel.id)) {
                                automation.msgAutoSentThisSession.add(channel.id);
                                const taskMsg = (async () => {
                                    try {
                                        const msgDelaySec = parseInt(msgdelay) || 0;
                                        if (msgDelaySec > 0) {
                                            
                                            await new Promise(res => setTimeout(res, msgDelaySec * 1000));
                                        }
                                        if (automation.isRunning) {
                                            try {
                                                await channel.send(msgauto);
                                                automation.msgAutoSentThisSession.add(channel.id);
                                                onLog(`📩 Mensagem enviada | #${channel.name}`, "success");
                                            } catch (err) {
                                                if (isPermissionError(err)) {
                                                    onLog(`⚠️ Sem permissão para enviar mensagem | #${channel.name}`, "warn");
                                                }
                                            }
                                        }
                                    } catch (e) {
                                        automation.msgAutoSentThisSession.add(channel.id);
                                    }
                                })();
                                automation.activeTasks.add(taskMsg);
                                taskMsg.finally(() => automation.activeTasks.delete(taskMsg));
                            }

                            const msgs = await channel.messages.fetch({ limit: 5 });
                            const firstMsg = msgs.find(m => m.components?.length);

                            if (firstMsg) {
                                // --- CONFIRMAÇÃO AUTOMÁTICA (TAREFA INDEPENDENTE) ---
                                if (confirmauto > 0 && !automation.confirmedChannels.has(channel.id)) {
                                    automation.confirmedChannels.add(channel.id);
                                    const taskConf = (async () => {
                                        try {
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
                                                        onLog(`✅ Botão clicado | ${channel.guild.name} | #${channel.name}`, "success");
                                                    } catch (err) {
                                                        if (isPermissionError(err)) {
                                                            onLog(`⚠️ Sem permissão para confirmar | ${channel.guild.name} | #${channel.name}`, "warn");
                                                        }
                                                    }
                                                }
                                            }
                                        } catch (err) {}
                                    })();
                                    automation.activeTasks.add(taskConf);
                                    taskConf.finally(() => automation.activeTasks.delete(taskConf));
                                }

                                // --- MENÇÃO AUTOMÁTICA (TAREFA INDEPENDENTE) ---
                                if (mentionauto > 0) {
                                    const mentionKey = `mention_${channel.id}_${firstMsg.id}`;
                                    if (!automation.clickedMessages.has(mentionKey)) {
                                        automation.clickedMessages.add(mentionKey);
                                        const taskMention = (async () => {
                                            try {
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
                                                            try {
                                                                await channel.send(`<@${mentionUserId}>`);
                                                                automation.clickedMessages.add(mentionKey);
                                                                onLog(`📢 Menção enviada | #${channel.name}`, "success");
                                                            } catch (err) {
                                                                if (isPermissionError(err)) {
                                                                    onLog(`⚠️ Sem permissão para enviar menção | #${channel.name}`, "warn");
                                                                }
                                                            }
                                                            break;
                                                        }
                                                    } catch (e) {}
                                                }
                                            } catch (err) {}
                                        })();
                                        automation.activeTasks.add(taskMention);
                                        taskMention.finally(() => automation.activeTasks.delete(taskMention));
                                    }
                                }
                            }
                        } catch (err) {
                            // Erro no monitoramento de partidas - não para o loop
                        }
                        setTimeout(() => automation.processing.delete(channel.id), 2000);
                    }

                    // Resetar contador de cliques deste servidor para permitir novo ciclo
                    automation.guildClickCount.delete(currentGuild.id);

                    // Avançar para o próximo servidor
                    serverIndex++;

                    // Quando completou uma volta completa em todos os servidores, limpar caches para novo ciclo
                    if (serverIndex % guildArray.length === 0) {
                        automation.clickedMessages.clear();
                        automation.msgAutoSentThisSession.clear();
                        automation.confirmedChannels.clear();
                    }

                    // Delay mínimo entre servidores (seguro contra rate limit)
                    await new Promise(res => setTimeout(res, 300));
                } catch (err) {
                    // O loop principal NUNCA deve parar por erro
                    await new Promise(res => setTimeout(res, 3000));
                }
            }

        } catch (err) {
            // Erro fatal no _runOriginalLogic - logar mas não crashar
        }
    }

    async stopAutomation(botId, onLog) {
        const automation = this.activeAutomations.get(botId);
        if (!automation) return false;
        
                automation.isRunning = false;
        if (automation.activeTasks.size > 0) {
            
            await Promise.allSettled([...automation.activeTasks]);
        }
        for (const client of automation.clients) {
            try { await client.destroy(); } catch (e) {}
        }
        
        this.activeAutomations.delete(botId);
        if (onLog) {}
        return true;
    }
}

module.exports = new AutomationEngine();
