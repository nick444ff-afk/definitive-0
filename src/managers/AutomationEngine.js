const { Client } = require('discord.js-selfbot-v13');

/**
 * AutomationEngine - ARQUITETURA CONTÍNUA E ESTÁVEL
 * 
 * Mudanças principais:
 * 1. Loop contínuo (while) em vez de setInterval
 * 2. Processamento sequencial de servidores (volta ao primeiro após o último)
 * 3. Tarefas de mensagem automática, confirmação e menção executam independentemente
 * 4. Sem bloqueios na varredura principal
 * 5. Limpeza de estado temporário por servidor
 */
class AutomationEngine {
    constructor() {
        this.activeAutomations = new Map();
        this.MAX_ENTRIES_PER_GUILD = 1;
        this.scheduledTasks = new Map(); // Armazena tarefas agendadas por botId
    }

    async startAutomation(botId, config, onLog, onStats) {
        try {
            if (this.activeAutomations.has(botId)) {
                onLog("⚠️ Automação já em execução para este bot", "warn");
                return false;
            }

            const { tokens, msgauto, mentionauto, confirmauto, categories, modos, msgdelay } = config;
            if (!tokens || tokens.length === 0) {
                onLog("❌ Nenhum token fornecido", "error");
                return false;
            }

            const automation = {
                isRunning: true,
                clients: [],
                processing: new Set(),
                clickedMessages: new Set(),
                guildClickCount: new Map(),
                msgAutoSentThisSession: new Set(),
                confirmedChannels: new Set(),
                lastClickTime: 0,
                onLog,
                onStats,
                serverIndex: 0, // Índice do servidor atual na lista
                servers: [], // Lista de servidores a processar
                currentServer: null // Servidor sendo processado
            };

            this.activeAutomations.set(botId, automation);
            this.scheduledTasks.set(botId, []);

            onLog(`🚀 Iniciando ${tokens.length} tokens com intervalo de segurança...`, "info");
            
            // Login escalonado
            for (let i = 0; i < tokens.length; i++) {
                if (!automation.isRunning) break;
                
                const token = tokens[i];
                if (i > 0) {
                    const loginDelay = 3000 + Math.random() * 2000;
                    await new Promise(res => setTimeout(res, loginDelay));
                }
                
                this._runContinuousLogic(botId, automation, token, config).catch(err => {
                    onLog(`❌ Erro crítico no token ${token.substring(0, 10)}...: ${err.message}`, "error");
                });
            }

            return true;
        } catch (err) {
            onLog(`❌ Erro fatal ao iniciar automação: ${err.message}`, "error");
            return false;
        }
    }

    async _runContinuousLogic(botId, automation, token, config) {
        const { onLog, onStats } = automation;
        const { categories, modos, msgauto, mentionauto, confirmauto } = config;

        try {
            const self = new Client();
            
            self.on('error', (err) => onLog(`⚠️ Erro no Client: ${err.message}`, "warn"));
            self.on('disconnect', () => onLog(`⚠️ Client desconectado.`, "warn"));

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

            onLog(`[AUTOMAÇÃO] Buscando canais que contenham: [${searchFormats.join(', ')}] e [${searchCategories.join(', ')}]`, "success");

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
                                // Delay com jitter entre cliques
                                const now = Date.now();
                                const timeSinceLastClick = now - (automation.lastClickTime || 0);
                                const baseDelay = 2000;
                                const jitter = Math.random() * 1500;
                                const targetDelay = baseDelay + jitter;

                                if (timeSinceLastClick < targetDelay) {
                                    const waitTime = targetDelay - timeSinceLastClick;
                                    await new Promise(res => setTimeout(res, waitTime));
                                }
                                automation.lastClickTime = Date.now();

                                const newCount = (automation.guildClickCount.get(guildId) || 0) + 1;
                                automation.guildClickCount.set(guildId, newCount);
                                
                                await msg.clickButton(correctButton.customId);
                                automation.clickedMessages.add(msg.id);
                                
                                onLog(`🔘 Botão clicado em #${channel.name}`, "success");
                                if (onStats) onStats({ entradas: [...automation.guildClickCount.values()].reduce((a, b) => a + b, 0) });
                                
                                if (newCount >= this.MAX_ENTRIES_PER_GUILD) break;
                            } catch (err) {
                                onLog(`❌ Erro ao clicar em #${channel.name}: ${err.message}`, "error");
                            }
                        }
                    }
                } catch (err) {
                    // Erro silencioso ao buscar mensagens
                }
            };

            // ═══════════════════════════════════════════════════════════════
            // LOOP CONTÍNUO PRINCIPAL - FLUXO INFINITO
            // ═══════════════════════════════════════════════════════════════
            
            while (automation.isRunning) {
                try {
                    // 1. BUSCAR CANAIS DE FILA
                    const canaisFila = self.channels.cache.filter(c => {
                        if (c.type !== "GUILD_TEXT") return false;
                        const nome = c.name.toLowerCase();
                        const matchesFormat = searchFormats.length === 0 || searchFormats.some(f => nome.includes(f));
                        const matchesCategory = searchCategories.length === 0 || searchCategories.some(cat => nome.includes(cat));
                        return matchesFormat && matchesCategory;
                    });

                    // 2. PROCESSAR CANAIS DE FILA SEQUENCIALMENTE
                    for (const [, channel] of canaisFila) {
                        if (!automation.isRunning) break;
                        
                        const guildId = channel.guild?.id;
                        if (guildId && (automation.guildClickCount.get(guildId) || 0) >= this.MAX_ENTRIES_PER_GUILD) continue;

                        automation.currentServer = channel.guild?.name || "Desconhecido";
                        
                        await processChannel(channel);
                        
                        // Delay entre canais (1-2 segundos)
                        await new Promise(res => setTimeout(res, 1000 + Math.random() * 1000));
                    }

                    // 3. PROCESSAR CANAIS DE PARTIDA (MENSAGEM AUTO, CONFIRMAÇÃO, MENÇÃO)
                    const canaisPartida = self.channels.cache.filter(channel =>
                        channel.guild &&
                        (channel.type === "GUILD_TEXT" || channel.type === "GUILD_PRIVATE_THREAD") &&
                        (channel.name?.toLowerCase().includes("aguardando") || 
                         channel.name?.toLowerCase().includes("partida") || 
                         channel.name?.toLowerCase().includes("fila")) &&
                        channel.viewable
                    );

                    for (const [, channel] of canaisPartida) {
                        if (!automation.isRunning) break;

                        try {
                            // AGENDAR MENSAGEM AUTOMÁTICA (SEM BLOQUEAR)
                            if (msgauto && !automation.msgAutoSentThisSession.has(channel.id)) {
                                const msgDelaySec = parseInt(config.msgdelay) || 0;
                                onLog(`⏳ Mensagem agendada para #${channel.name} (${msgDelaySec}s)`, "info");
                                // Criar tarefa independente para enviar mensagem
                                this._scheduleMessageTask(botId, self, channel, msgauto, msgDelaySec, onLog);
                            }

                            // AGENDAR CONFIRMAÇÃO AUTOMÁTICA (SEM BLOQUEAR)
                            if (confirmauto > 0 && !automation.confirmedChannels.has(channel.id)) {
                                const msgs = await channel.messages.fetch({ limit: 5 });
                                const firstMsg = msgs.find(m => m.components?.length);

                                if (firstMsg) {
                                    this._scheduleConfirmationTask(botId, firstMsg, channel, confirmauto, IGNORED_BUTTONS, onLog);
                                }
                            }

                            // AGENDAR MENÇÃO AUTOMÁTICA (SEM BLOQUEAR)
                            if (mentionauto > 0) {
                                const msgs = await channel.messages.fetch({ limit: 5 });
                                const firstMsg = msgs.find(m => m.components?.length);

                                if (firstMsg) {
                                    this._scheduleMentionTask(botId, self, channel, firstMsg, mentionauto, onLog);
                                }
                            }
                        } catch (err) {
                            // Erro silencioso
                        }
                    }

                    // 4. LIMPAR ESTADOS TEMPORÁRIOS DO SERVIDOR ATUAL
                    if (automation.currentServer) {
                        automation.processing.clear();
                    }

                    // 5. PEQUENO DELAY ANTES DE RECOMEÇAR O CICLO
                    await new Promise(res => setTimeout(res, 500));

                } catch (err) {
                    onLog(`⚠️ Erro no loop contínuo: ${err.message}`, "warn");
                    await new Promise(res => setTimeout(res, 1000));
                }
            }

        } catch (err) {
            onLog(`❌ Erro no processamento do token: ${err.message}`, "error");
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // TAREFAS AGENDADAS INDEPENDENTES
    // ═══════════════════════════════════════════════════════════════

    _scheduleMessageTask(botId, client, channel, message, delaySeconds, onLog) {
        const automation = this.activeAutomations.get(botId);
        if (!automation) return;

        // Criar Promise que executa independentemente
        const task = (async () => {
            try {
                // Aguardar o delay
                if (delaySeconds > 0) {
                    await new Promise(res => setTimeout(res, delaySeconds * 1000));
                }

                // Validar antes de enviar
                if (!automation.isRunning || !client.user || !channel.viewable) {
                    return;
                }

                // Simular digitação
                await channel.sendTyping();
                const typingTime = 2000 + Math.random() * 3000;
                await new Promise(res => setTimeout(res, typingTime));

                // Enviar mensagem
                if (automation.isRunning) {
                    await channel.send(message);
                    automation.msgAutoSentThisSession.add(channel.id);
                    onLog(`💬 Mensagem enviada em #${channel.name}`, "info");
                }
            } catch (err) {
                automation.msgAutoSentThisSession.add(channel.id);
            }
        })();

        // Armazenar tarefa
        const tasks = this.scheduledTasks.get(botId) || [];
        tasks.push(task);
        this.scheduledTasks.set(botId, tasks);
    }

    _scheduleConfirmationTask(botId, message, channel, delaySeconds, ignoredButtons, onLog) {
        const automation = this.activeAutomations.get(botId);
        if (!automation) return;

        const task = (async () => {
            try {
                // Aguardar delay
                await new Promise(res => setTimeout(res, delaySeconds * 1000));

                // Validar antes de confirmar
                if (!automation.isRunning || automation.confirmedChannels.has(channel.id)) {
                    return;
                }

                // Procurar botão para confirmar
                let confirmed = false;
                for (const row of message.components) {
                    for (const button of row.components) {
                        if (confirmed) continue;
                        if (!button.customId || ignoredButtons.includes(button.label?.toLowerCase())) continue;
                        if (button.customId === "leave_player") continue;

                        try {
                            await message.clickButton(button.customId);
                            confirmed = true;
                            automation.confirmedChannels.add(channel.id);
                        } catch (err) {
                            // Silencioso
                        }
                    }
                }
            } catch (err) {
                // Silencioso
            }
        })();

        const tasks = this.scheduledTasks.get(botId) || [];
        tasks.push(task);
        this.scheduledTasks.set(botId, tasks);
    }

    _scheduleMentionTask(botId, client, channel, message, delaySeconds, onLog) {
        const automation = this.activeAutomations.get(botId);
        if (!automation) return;

        const task = (async () => {
            try {
                // Aguardar delay
                await new Promise(res => setTimeout(res, delaySeconds * 1000));

                // Validar antes de mencionar
                if (!automation.isRunning || !client.user) {
                    return;
                }

                const mentionKey = `mention_${channel.id}_${message.id}`;
                if (automation.clickedMessages.has(mentionKey)) {
                    return;
                }

                // Extrair menções
                let foundMentions = [];
                const regex = /<@!?(\d+)>/g;
                
                const contentMentions = [...(message.content || "").matchAll(regex)].map(m => m[1]);
                foundMentions.push(...contentMentions);
                
                for (const embed of message.embeds) {
                    if (embed.description) foundMentions.push(...[...embed.description.matchAll(regex)].map(m => m[1]));
                    if (embed.fields) embed.fields.forEach(f => foundMentions.push(...[...f.value.matchAll(regex)].map(m => m[1])));
                }
                
                foundMentions = [...new Set(foundMentions)].filter(id => id !== client.user.id);
                
                // Mencionar usuários
                for (const mentionUserId of foundMentions) {
                    try {
                        const member = await channel.guild.members.fetch(mentionUserId);
                        if (!member.permissions.has("MANAGE_MESSAGES")) {
                            await channel.send(`<@${mentionUserId}>`);
                            automation.clickedMessages.add(mentionKey);
                            onLog(`👥 Menção enviada para <@${mentionUserId}> em #${channel.name}`, "info");
                            break;
                        }
                    } catch (e) {}
                }
            } catch (err) {
                // Silencioso
            }
        })();

        const tasks = this.scheduledTasks.get(botId) || [];
        tasks.push(task);
        this.scheduledTasks.set(botId, tasks);
    }

    async stopAutomation(botId, onLog) {
        const automation = this.activeAutomations.get(botId);
        if (!automation) return false;
        
        automation.isRunning = false;
        
        for (const client of automation.clients) {
            try { await client.destroy(); } catch (e) {}
        }
        
        // Aguardar tarefas agendadas terminarem
        const tasks = this.scheduledTasks.get(botId) || [];
        try {
            await Promise.all(tasks);
        } catch (e) {}
        
        this.activeAutomations.delete(botId);
        this.scheduledTasks.delete(botId);
        if (onLog) onLog("⚠️ Automação parada com sucesso", "warn");
        return true;
    }
}

module.exports = new AutomationEngine();
