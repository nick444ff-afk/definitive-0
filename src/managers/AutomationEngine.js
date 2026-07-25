const { Client } = require('discord.js-selfbot-v13');

/**
 * AutomationEngine - ARQUITETURA CORRIGIDA
 * Fluxo contínuo infinito, mensagens independentes, validação de permissões.
 * A automação NUNCA para sozinha. Só para quando o usuário desliga ou a app encerra.
 */
class AutomationEngine {
    constructor() {
        this.activeAutomations = new Map();
        this.MAX_ENTRIES_PER_GUILD = 1;
    }

    // ═══════════════════════════════════════════════════════════════════
    // INICIAR AUTOMAÇÃO
    // ═══════════════════════════════════════════════════════════════════
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
                mentionKeys: new Set(),
                lastClickTime: 0,
                // Tarefas independentes (mensagens, confirmações, menções)
                activeTasks: new Set(),
                onLog,
                onStats
            };

            this.activeAutomations.set(botId, automation);

            // --- LOGIN ESCALONADO ---
            onLog(`🚀 Iniciando ${tokens.length} tokens com intervalo de segurança...`, "info");
            for (let i = 0; i < tokens.length; i++) {
                if (!automation.isRunning) break;

                const token = tokens[i];
                if (i > 0) {
                    const loginDelay = 3000 + Math.random() * 2000; // 3-5 segundos entre logins
                    await new Promise(res => setTimeout(res, loginDelay));
                }

                this._runContinuousLoop(botId, automation, token, config).catch(err => {
                    onLog(`❌ Erro crítico no token ${token.substring(0, 10)}...: ${err.message}`, "error");
                });
            }

            return true;
        } catch (err) {
            onLog(`❌ Erro fatal ao iniciar automação: ${err.message}`, "error");
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // LOOP CONTÍNUO PRINCIPAL - NUNCA PARA
    // ═══════════════════════════════════════════════════════════════════
    async _runContinuousLoop(botId, automation, token, config) {
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

            // ═══════════════════════════════════════════════════════════
            // VALIDAÇÃO DE PERMISSÃO DE ENVIO
            // Verifica: canal existe, cliente tem acesso, bot tem SEND_MESSAGES
            // ═══════════════════════════════════════════════════════════
            const canSendMessage = async (channel) => {
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

            // ═══════════════════════════════════════════════════════════
            // TAREFA INDEPENDENTE: MENSAGEM AUTOMÁTICA
            // Executa sem bloquear o loop principal
            // Valida permissão ANTES de agendar e ANTES de enviar
            // ═══════════════════════════════════════════════════════════
            const scheduleAutoMessage = (channel) => {
                const taskKey = `automsg_${channel.id}`;

                // Validar permissão antes de agendar
                if (!canSendMessage(channel)) {
                    onLog(`[MSG-AUTO] ⚠️ Canal #${channel.name} (${channel.guild?.name}) ignorado - sem permissão de envio`, "warn");
                    return;
                }

                // Evitar duplicidade
                if (automation.msgAutoSentThisSession.has(taskKey)) return;
                automation.msgAutoSentThisSession.add(taskKey);

                const taskFn = async () => {
                    try {
                        // Validar novamente antes do envio
                        if (!automation.isRunning) return;
                        if (!self.user) return;
                        const permOk = await canSendMessage(channel);
                        if (!permOk) {
                            onLog(`[MSG-AUTO] ⚠️ Canal #${channel.name} perdeu permissão, tarefa cancelada`, "warn");
                            return;
                        }

                        const msgDelaySec = parseInt(config.msgdelay) || 0;
                        if (msgDelaySec > 0) {
                            onLog(`[MSG-AUTO] ⏳ Aguardando ${msgDelaySec}s para enviar mensagem em #${channel.name}`, "info");
                            await new Promise(res => setTimeout(res, msgDelaySec * 1000));
                        }

                        // Validar novamente após o delay
                        if (!automation.isRunning) return;
                        const permOk2 = await canSendMessage(channel);
                        if (!permOk2) {
                            onLog(`[MSG-AUTO] ⚠️ Canal #${channel.name} perdeu permissão durante delay, tarefa cancelada`, "warn");
                            return;
                        }

                        // Simulação de digitação
                        await channel.sendTyping();
                        const typingTime = 2000 + Math.random() * 3000;
                        await new Promise(res => setTimeout(res, typingTime));

                        if (automation.isRunning) {
                            const permOk3 = await canSendMessage(channel);
                            if (!permOk3) {
                                onLog(`[MSG-AUTO] ⚠️ Canal #${channel.name} perdeu permissão antes do envio, tarefa cancelada`, "warn");
                                return;
                            }
                            await channel.send(msgauto);
                            onLog(`[MSG-AUTO] ✅ Enviada em #${channel.name}`, "success");
                        }
                    } catch (e) {
                        onLog(`[MSG-AUTO] ❌ Erro em #${channel.name}: ${e.message}`, "error");
                    }
                };

                // Executar como tarefa independente (fire-and-forget)
                const task = taskFn();
                automation.activeTasks.add(task);
                task.finally(() => automation.activeTasks.delete(task));
            };

            // ═══════════════════════════════════════════════════════════
            // TAREFA INDEPENDENTE: CONFIRMAÇÃO AUTOMÁTICA
            // ═══════════════════════════════════════════════════════════
            const scheduleConfirmation = (channel, firstMsg) => {
                if (confirmauto <= 0) return;
                const confKey = `conf_${channel.id}`;
                if (automation.confirmedChannels.has(confKey)) return;
                automation.confirmedChannels.add(confKey);

                const taskFn = async () => {
                    try {
                        if (!automation.isRunning) return;
                        if (!self.user) return;

                        await new Promise(res => setTimeout(res, confirmauto * 1000));

                        if (!automation.isRunning) return;
                        const permOk = await canSendMessage(channel);
                        if (!permOk) {
                            onLog(`[CONFIRM] ⚠️ Canal #${channel.name} sem permissão, confirmação cancelada`, "warn");
                            return;
                        }

                        let confirmed = false;
                        for (const row of firstMsg.components) {
                            for (const button of row.components) {
                                if (confirmed) continue;
                                if (!button.customId || IGNORED_BUTTONS.includes(button.label?.toLowerCase())) continue;
                                if (button.customId === "leave_player") continue;

                                try {
                                    await firstMsg.clickButton(button.customId);
                                    confirmed = true;
                                    onLog(`[CONFIRM] ✅ Confirmado em #${channel.name}`, "success");
                                } catch (err) {
                                    onLog(`[CONFIRM] ❌ Erro em #${channel.name}: ${err.message}`, "error");
                                }
                            }
                        }
                    } catch (err) {
                        onLog(`[CONFIRM] ❌ Erro em #${channel.name}: ${err.message}`, "error");
                    }
                };

                const task = taskFn();
                automation.activeTasks.add(task);
                task.finally(() => automation.activeTasks.delete(task));
            };

            // ═══════════════════════════════════════════════════════════
            // TAREFA INDEPENDENTE: MENÇÃO AUTOMÁTICA
            // ═══════════════════════════════════════════════════════════
            const scheduleMention = (channel, firstMsg) => {
                if (mentionauto <= 0) return;
                const mentionKey = `mention_${channel.id}_${firstMsg.id}`;
                if (automation.mentionKeys.has(mentionKey)) return;
                automation.mentionKeys.add(mentionKey);

                const taskFn = async () => {
                    try {
                        if (!automation.isRunning) return;
                        if (!self.user) return;

                        await new Promise(res => setTimeout(res, mentionauto * 1000));

                        if (!automation.isRunning) return;
                        const permOk = await canSendMessage(channel);
                        if (!permOk) {
                            onLog(`[MENÇÃO] ⚠️ Canal #${channel.name} sem permissão, menção cancelada`, "warn");
                            return;
                        }

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
                            if (!automation.isRunning) break;
                            try {
                                const member = await channel.guild.members.fetch(mentionUserId);
                                if (!member.permissions.has("MANAGE_MESSAGES")) {
                                    const permOk = await canSendMessage(channel);
                                    if (!permOk) {
                                        onLog(`[MENÇÃO] ⚠️ Canal #${channel.name} sem permissão, menção cancelada`, "warn");
                                        break;
                                    }
                                    await channel.send(`<@${mentionUserId}>`);
                                    onLog(`[MENÇÃO] ✅ Mencionou <@${mentionUserId}> em #${channel.name}`, "success");
                                    break;
                                }
                            } catch (e) {}
                        }
                    } catch (err) {
                        onLog(`[MENÇÃO] ❌ Erro em #${channel.name}: ${err.message}`, "error");
                    }
                };

                const task = taskFn();
                automation.activeTasks.add(task);
                task.finally(() => automation.activeTasks.delete(task));
            };

            // ═══════════════════════════════════════════════════════════
            // PROCESSAR CANAL DE FILA (CLIQUE)
            // ═══════════════════════════════════════════════════════════
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
                                // --- DELAY COM JITTER ENTRE CLIQUES ---
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

                                onLog(`✅ Entrada realizada em #${channel.name} (${channel.guild.name}) [${newCount}/${this.MAX_ENTRIES_PER_GUILD}]`, "success");
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

            // ═══════════════════════════════════════════════════════════
            // PROCESSAR SERVIDOR COMPLETO
            // ═══════════════════════════════════════════════════════════
            const processServer = async (guild, queueChannels, partidaChannels) => {
                const guildId = guild?.id;
                if (!guildId) return;

                // 1. Processar canais de fila (cliques)
                for (const [, channel] of queueChannels) {
                    if (!automation.isRunning) break;
                    if (automation.processing.has(channel.id)) continue;

                    const gId = channel.guild?.id;
                    if (gId && (automation.guildClickCount.get(gId) || 0) >= this.MAX_ENTRIES_PER_GUILD) continue;

                    automation.processing.add(channel.id);
                    await processChannel(channel);
                    automation.processing.delete(channel.id);

                    // Delay entre canais
                    await new Promise(res => setTimeout(res, 1000 + Math.random() * 1000));
                }

                // 2. Agendar tarefas independentes para canais de partida
                for (const [, channel] of partidaChannels) {
                    if (!automation.isRunning) break;

                    const autoMsgKey = `automsg_${channel.id}`;
                    if (automation.msgAutoSentThisSession.has(autoMsgKey)) continue;

                    try {
                        const msgs = await channel.messages.fetch({ limit: 5 });
                        const firstMsg = msgs.find(m => m.components?.length);

                        // Agendar mensagem automática (independente, não bloqueia)
                        scheduleAutoMessage(channel);

                        if (firstMsg) {
                            // Agendar confirmação (independente, não bloqueia)
                            scheduleConfirmation(channel, firstMsg);

                            // Agendar menção (independente, não bloqueia)
                            scheduleMention(channel, firstMsg);
                        }
                    } catch (err) {
                        // Erro silencioso
                    }
                }
            };

            // ═══════════════════════════════════════════════════════════
            // LOOP INFINITO - PERCORRE TODOS OS SERVIDORES CONTINUAMENTE
            // Processa servidor 1 → servidor 2 → ... → servidor N → servidor 1 → ...
            // NUNCA PARA enquanto automation.isRunning === true
            // ═══════════════════════════════════════════════════════════
            let serverIndex = 0;

            while (automation.isRunning) {
                try {
                    // Coletar todos os servidores disponíveis
                    const guilds = self.guilds.cache.filter(g => !g.unavailable);
                    const guildArray = [...guilds.values()];

                    if (guildArray.length === 0) {
                        // Nenhum servidor disponível, aguardar e tentar novamente
                        await new Promise(res => setTimeout(res, 5000));
                        continue;
                    }

                    // Garantir que o índice está dentro do range (loop circular)
                    serverIndex = serverIndex % guildArray.length;
                    const currentGuild = guildArray[serverIndex];

                    // Buscar canais de fila neste servidor
                    const queueChannels = currentGuild.channels.cache.filter(c => {
                        if (c.type !== "GUILD_TEXT") return false;
                        const nome = c.name.toLowerCase();
                        const matchesFormat = searchFormats.length === 0 || searchFormats.some(f => nome.includes(f));
                        const matchesCategory = searchCategories.length === 0 || searchCategories.some(cat => nome.includes(cat));
                        return matchesFormat && matchesCategory;
                    });

                    // Buscar canais de partida neste servidor
                    const partidaChannels = currentGuild.channels.cache.filter(channel =>
                        (channel.type === "GUILD_TEXT" || channel.type === "GUILD_PRIVATE_THREAD") &&
                        channel.viewable &&
                        (channel.name?.toLowerCase().includes("aguardando") ||
                         channel.name?.toLowerCase().includes("partida") ||
                         channel.name?.toLowerCase().includes("fila"))
                    );

                    // Processar este servidor
                    await processServer(currentGuild, queueChannels, partidaChannels);

                    // Resetar contador de cliques deste servidor para permitir novo ciclo
                    const gid = currentGuild.id;
                    automation.guildClickCount.delete(gid);

                    // Avançar para o próximo servidor
                    serverIndex++;

                    // Pequeno delay entre servidores
                    await new Promise(res => setTimeout(res, 1000 + Math.random() * 1000));

                } catch (err) {
                    onLog(`⚠️ Erro no loop principal: ${err.message}`, "warn");
                    // NUNCA parar a automação por erro no loop
                    // Aguardar e continuar
                    await new Promise(res => setTimeout(res, 3000));
                }
            }

        } catch (err) {
            onLog(`❌ Erro no processamento do token: ${err.message}`, "error");
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // PARAR AUTOMAÇÃO
    // ═══════════════════════════════════════════════════════════════════
    async stopAutomation(botId, onLog) {
        const automation = this.activeAutomations.get(botId);
        if (!automation) return false;

        automation.isRunning = false;
        // Aguardar tarefas pendentes encerrarem
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
