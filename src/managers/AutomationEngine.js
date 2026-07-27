const { Client } = require('discord.js-selfbot-v13');

/**
 * AutomationEngine - LÓGICA INTEGRADA E REFINADA
 * Extraída do commit fd71344f8f267f519f2b41874e10f18949536399
 * FIX: Tratamento robusto de erros 50013 (Missing Permissions)
 * FIX: Fila controlada para mensagens/menções com agendamento no tempo certo
 * FIX: Rotina paralela de monitoramento de partidas independente do loop de cliques
 * UPDATE: Mecanismo de timeout e skip para servidores problemáticos (castigo, bot offline, erro de intenção)
 */
class AutomationEngine {
    constructor() {
        this.activeAutomations = new Map();
        this.MAX_ENTRIES_PER_GUILD = 5;
        this.limiteCliques = 5;
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
                clickedMessagesByGuild: new Map(),  // guildId -> Set de msgIds clicados nesta volta
                guildClickCount: new Map(),          // guildId -> total de cliques
                guildClickCountByMode: new Map(),     // "guildId:modo" -> cliques naquele modo
                msgAutoSentThisSession: new Set(),
                confirmedChannels: new Set(),
                failedButtons: new Map(),     // "msgId:buttonLabel" -> falhas
                guildErrorCount: new Map(),   // guildId -> contador de erros consecutivos
                blacklistedGuilds: new Set(), // guildId -> servidores ignorados temporariamente
                lastClickTime: 0,
                activeTasks: new Set(),
                limitesPorModo: {},
                limitesPorModoNames: {},
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

            try {
                await self.login(token);
                automation.clients.push(self);
                onLog(`🟢 Logado com @${self.user.username}`, "success");
            } catch (err) {
                if (err.message && (err.message.includes('Unauthorized') || err.code === 40142)) {
                    onLog(`❌ Token inválido`, "error");
                } else {
                    onLog(`❌ Token inválido`, "error");
                }
                return;
            }
            

            const categoriaMap = {
                mobile: "mob",
                emulador: "emu",
                misto: "misto",
                tatico: "tatico"
            };

            const searchFormats = (modos || []).map(m => m.toLowerCase().replace(/v|x/g, " ").replace(/-|_/g, " ").replace(/\s+/g, " ").trim());
            const searchCategories = (categories || []).map(cat => categoriaMap[cat.toLowerCase()] || cat.toLowerCase());

            // ═══════════════════════════════════════════════════════
            // LIMITE DE CLIQUES COM DIVISÃO JUSTA POR MODO
            // ═══════════════════════════════════════════════════════
            const limiteCliques = config.limiteCliques || 5;
            const numModos = searchFormats.length || 1;
            const basePorModo = Math.max(1, Math.floor(limiteCliques / numModos));
            const sobra = limiteCliques - (basePorModo * numModos);
            
            // Distribuir sobra: primeiros modos ficam com +1
            const limitesPorModo = {};
            (modos || []).forEach((m, i) => {
                limitesPorModo[m.toLowerCase()] = basePorModo + (i < sobra ? 1 : 0);
            });
            // Se só 1 modo, usa o limite inteiro
            if (numModos === 1 && (modos || []).length === 1) {
                limitesPorModo[(modos || [])[0].toLowerCase()] = limiteCliques;
            }
            
            automation.limitesPorModo = limitesPorModo;
            automation.limitesPorModoNames = {};
            (modos || []).forEach(m => {
                const normalized = m.toLowerCase().replace(/v|x/g, " ").replace(/-|_/g, " ").replace(/\s+/g, " ").trim();
                automation.limitesPorModoNames[normalized] = limitesPorModo[m.toLowerCase()] || basePorModo;
            });

            const CATEGORY_KEYWORDS = {
                mobile: ["mobile", "mob", "celular", "📱"],
                emulador: ["emulador", "emu", "emul", "🖥️", "🖥"],
                misto: ["misto", "mis", "mix", "🕹️", "🕹"],
                tatico: ["tatico", "tático", "tat", "❗"]
            };

            // Keywords de botões extras: gelo e modos especiais
            const BUTTON_KEYWORDS = [
                "gelo normal", "gelo inf", "gelo infinito"
            ];

            const IGNORED_BUTTONS = ["leave_player", "cancelar", "fechar", "finalizar", "recusar", "sair", "sair da fila", "entrar na fila"];

            const findCorrectButton = (buttons, activeCategories) => {
                let bestMatch = null;
                
                // 1) Buscar por categoria (mobile, emulador, misto, tatico)
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

                // 2) Buscar por botões extras (gelo, full ump, etc)
                if (!bestMatch) {
                    for (const button of buttons) {
                        if (IGNORED_BUTTONS.includes(button.customId?.toLowerCase())) continue;
                        if (button.label && IGNORED_BUTTONS.includes(button.label.toLowerCase())) continue;

                        const searchText = `${button.customId} ${button.label} ${button.emoji?.name}`.toLowerCase();
                        if (BUTTON_KEYWORDS.some(kw => searchText.includes(kw))) {
                            bestMatch = button;
                            break;
                        }
                    }
                }

                // 3) Fallback: join_player
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

            // ═══════════════════════════════════════════════════════════════
            // FILA CONTROLADA DE TAREFAS (MSG AUTO + MENÇÃO + CONFIRMAÇÃO)
            // ═══════════════════════════════════════════════════════════════
            const scheduledTasks = new Map(); // key -> { type, channel, scheduledAt, timeoutId, resolved }
            const msgSentChannels = new Set(); // canais onde já foi enviada 1 mensagem (limite por ciclo)
            const mentionSentChannels = new Set(); // canais onde já foi enviada 1 menção (limite por ciclo)
            const MAX_TASK_TIMEOUT = 60000; // 60s timeout máximo por tarefa

            const scheduleTask = (key, type, channel, delayMs, executor) => {
                // Se já existe uma tarefa agendada para este key, não reagenda
                if (scheduledTasks.has(key)) return;

                const scheduledAt = Date.now() + delayMs;

                // Limite absoluto: não agendar além de 60s no futuro
                if (delayMs > MAX_TASK_TIMEOUT) {
                    // Tarefa descartada - sem log para não poluir
                    return;
                }

                const taskEntry = {
                    type,
                    channel,
                    scheduledAt,
                    timeoutId: null,
                    resolved: false
                };

                const timeoutId = setTimeout(async () => {
                    try {
                        await executor();
                    } catch (err) {
                        if (isPermissionError(err)) {
                            onLog(`⚠️ Sem permissão | ${channel.guild?.name || 'Desconhecido'}`, "warn");
                        }
                    } finally {
                        taskEntry.resolved = true;
                        scheduledTasks.delete(key);
                    }
                }, delayMs);

                taskEntry.timeoutId = timeoutId;
                scheduledTasks.set(key, taskEntry);

                // Agendado - sem log no painel
            };

            const cancelAllScheduledTasks = () => {
                for (const [, task] of scheduledTasks) {
                    clearTimeout(task.timeoutId);
                }
                scheduledTasks.clear();
            };

            // ═══════════════════════════════════════════════════════════════
            // AGENDAR MSG/MENÇÃO/CONFIRMAÇÃO PARA UM CANAL DE PARTIDA
            // (Usado pela rotina paralela)
            // VERIFICAÇÃO: checa se a mensagem/menção já existe no canal antes de enviar
            // ═══════════════════════════════════════════════════════════════
            const scheduleMatchTasks = async (channel) => {
                let msgs, firstMsg;
                try {
                    msgs = await channel.messages.fetch({ limit: 10 });
                    firstMsg = msgs.find(m => m.components?.length);
                } catch (err) {
                    // Se não consegue ler mensagens (sem permissão ou thread privada), não agenda nada
                    return;
                }
                const messagesContent = [...msgs.values()].map(m => m.content);

                // --- MENSAGEM AUTOMÁTICA (verifica se já existe no canal) ---
                if (msgauto && !msgSentChannels.has(channel.id)) {
                    msgSentChannels.add(channel.id);
                    const msgKey = `msg_${channel.id}`;

                    // Verificar se a mensagem já existe no canal
                    const msgAlreadySent = messagesContent.some(content => content === msgauto);

                    if (!msgAlreadySent && !scheduledTasks.has(msgKey)) {
                        const msgDelaySec = parseInt(msgdelay) || 0;
                        const msgDelayMs = msgDelaySec > 0 ? msgDelaySec * 1000 : 500;
                        scheduleTask(msgKey, 'msgauto', channel, msgDelayMs, async () => {
                            try {
                                if (!automation.isRunning) return;
                                // Verificação dupla antes de enviar
                                const recentMsgs = await channel.messages.fetch({ limit: 10 });
                                const stillExists = [...recentMsgs.values()].some(m => m.content === msgauto);
                                if (stillExists) return; // Já existe, não envia
                                await channel.send(msgauto);
                                onLog(`📩 Mensagem enviada | ${channel.guild?.name}`, "success");
                            } catch (err) {
                                // Erro ao enviar mensagem - silencioso
                            }
                        });
                    }
                }

                // --- CONFIRMAÇÃO AUTOMÁTICA ---
                if (firstMsg) {
                    const confKey = `conf_${channel.id}`;
                    if (confirmauto > 0 && !automation.confirmedChannels.has(channel.id) && !scheduledTasks.has(confKey)) {
                        automation.confirmedChannels.add(channel.id);
                        const confDelayMs = confirmauto * 1000;

                        scheduleTask(confKey, 'confirmação', channel, confDelayMs, async () => {
                            try {
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
                                            onLog(`✅ Confirmado | ${channel.guild?.name}`, "success");
                                        } catch (err) {
                                            // Erro ao confirmar - silencioso
                                        }
                                    }
                                }
                            } catch (err) {}
                        });
                    }

                    // --- MENÇÃO AUTOMÁTICA (verifica se já existe no canal) ---
                    const mentionKey = `mention_${channel.id}`;
                    if (mentionauto > 0 && !mentionSentChannels.has(channel.id)) {
                        mentionSentChannels.add(channel.id);
                        const mentionDelayMs = mentionauto * 1000;

                        scheduleTask(mentionKey, 'menção', channel, mentionDelayMs, async () => {
                            try {
                                if (!automation.isRunning) return;
                                
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
                                            // Verificação dupla: checar se a menção já existe no canal
                                            const recentMsgs2 = await channel.messages.fetch({ limit: 10 });
                                            const mentionAlreadySent = [...recentMsgs2.values()].some(m => m.content.includes(`<@${mentionUserId}>`) && m.author.id === self.user.id);
                                            if (mentionAlreadySent) return; // Já existe, não envia
                                            
                                            try {
                                                await channel.send(`<@${mentionUserId}>`);
                                                automation.clickedMessages.add(mentionKey);
                                                onLog(`📢 Menção enviada | ${channel.guild?.name}`, "success");
                                            } catch (err) {
                                                // Erro ao enviar menção - silencioso
                                            }
                                            break;
                                        }
                                    } catch (e) {}
                                }
                            } catch (err) {}
                        });
                    }
                }
            };

            // Função para detectar qual modo um canal pertence
            const getChannelMode = (channel) => {
                const nome = channel.name.toLowerCase();
                const nomeNormalized = nome.replace(/[-_xv]/g, " ").replace(/\s+/g, " ").trim();
                for (const mode of searchFormats) {
                    if (nomeNormalized.includes(mode)) return mode;
                }
                return null;
            };

            const processChannel = async (channel) => {
                const guildId = channel.guild?.id;
                if (!guildId || !automation.isRunning) return;
                
                // Detectar modo deste canal
                const channelMode = getChannelMode(channel);
                const modeKey = channelMode || "unknown";
                const modeLimit = automation.limitesPorModoNames[channelMode] || this.MAX_ENTRIES_PER_GUILD;
                const modeCountKey = `${guildId}:${modeKey}`;
                
                // Verificar limite por servidor+modo
                const modeClicks = automation.guildClickCountByMode.get(modeCountKey) || 0;
                if (modeClicks >= modeLimit) return;

                try {
                    // Implementar um timeout para o fetch de mensagens
                    const fetchPromise = channel.messages.fetch({ limit: 15 });
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout fetch')), 5000));
                    
                    const msgs = await Promise.race([fetchPromise, timeoutPromise]);
                    const msgArray = [...msgs.values()];

                    // Nomes do bot (case-insensitive)
                    const myNamesLower = [];
                    if (self.user?.username) myNamesLower.push(self.user.username.toLowerCase());
                    if (self.user?.displayName) myNamesLower.push(self.user.displayName.toLowerCase());
                    if (self.user?.globalName) myNamesLower.push(self.user.globalName.toLowerCase());

                    // Extrair todo o texto de uma mensagem
                    const getAllText = (msg) => {
                        const texts = [];
                        if (msg.content) texts.push(msg.content);
                        if (msg.embeds) {
                            for (const embed of msg.embeds) {
                                if (embed.title) texts.push(embed.title);
                                if (embed.description) texts.push(embed.description);
                                if (embed.footer?.text) texts.push(embed.footer.text);
                                if (embed.author?.name) texts.push(embed.author.name);
                                if (embed.fields) {
                                    for (const field of embed.fields) {
                                        if (field.name) texts.push(field.name);
                                        if (field.value) texts.push(field.value);
                                    }
                                }
                            }
                        }
                        return texts;
                    };

                    // Verifica se o bot está na fila de um botão específico
                    const isBotInButtonQueue = (msg, buttonLabel) => {
                        if (!buttonLabel || myNamesLower.length === 0) return false;
                        const labelLower = buttonLabel.toLowerCase();
                        for (const text of getAllText(msg)) {
                            const lines = text.split("\n");
                            for (const line of lines) {
                                const lineLower = line.toLowerCase();
                                if (lineLower.includes(labelLower)) {
                                    for (const name of myNamesLower) {
                                        if (lineLower.includes(name)) return true;
                                    }
                                }
                            }
                        }
                        return false;
                    };

                    // Fazer clique (só loga/conta se realmente funcionar)
                    const doClick = async (msg, button) => {
                        try {
                            const now = Date.now();
                            const timeSinceLastClick = now - (automation.lastClickTime || 0);
                            if (timeSinceLastClick < 500) {
                                await new Promise(res => setTimeout(res, 500 - timeSinceLastClick));
                            }
                            automation.lastClickTime = Date.now();

                            // Adicionar timeout ao clique do botão
                            const clickPromise = msg.clickButton(button.customId);
                            const clickTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout clique')), 8000));
                            
                            await Promise.race([clickPromise, clickTimeout]);
                            
                            if (!automation.clickedMessagesByGuild.has(guildId)) {
                                automation.clickedMessagesByGuild.set(guildId, new Set());
                            }
                            automation.clickedMessagesByGuild.get(guildId).add(msg.id);
                            
                            // Remover falhas anteriores se clicou com sucesso
                            automation.failedButtons.delete(`${msg.id}:${button.label || button.customId}`);
                            automation.guildErrorCount.delete(guildId); // Resetar erros do servidor ao ter sucesso

                            const newModeCount = (automation.guildClickCountByMode.get(modeCountKey) || 0) + 1;
                            automation.guildClickCountByMode.set(modeCountKey, newModeCount);
                            const totalClicks = (automation.guildClickCount.get(guildId) || 0) + 1;
                            automation.guildClickCount.set(guildId, totalClicks);

                            onLog(`✅ Clicado | ${channel.guild.name} | #${channel.name} | ${newModeCount}/${modeLimit}`, "success");
                            if (onStats) onStats({ entradas: totalClicks });
                            return true;
                        } catch (err) {
                            // Registrar falha deste botão nesta mensagem
                            const failKey = `${msg.id}:${button.label || button.customId}`;
                            const failCount = (automation.failedButtons.get(failKey) || 0) + 1;
                            automation.failedButtons.set(failKey, failCount);
                            
                            // Incrementar erros do servidor
                            const guildErrors = (automation.guildErrorCount.get(guildId) || 0) + 1;
                            automation.guildErrorCount.set(guildId, guildErrors);
                            
                            onLog(`⚠️ Falha ao clicar | ${channel.guild?.name || '?'} | #${channel.name || '?'} | Erro: ${err.message || err}`, "warn");
                            
                            // Se muitos erros seguidos no servidor, colocar em blacklist permanente na sessão
                            if (guildErrors >= 5) {
                                automation.blacklistedGuilds.add(guildId);
                                onLog(`🚫 Servidor ${channel.guild?.name} BLOQUEADO permanentemente nesta sessão por excesso de falhas.`, "error");
                            }
                            
                            return false;
                        }
                    };

                    // ═══════════════════════════════════════════════════════════
                    // FILTRO DE VALOR
                    // ═══════════════════════════════════════════════════════════
                    const valorMin = config.valorMinimo || 0;
                    const valorMax = config.valorMaximo || 0;

                    // Extrai qualquer valor monetário da mensagem
                    const extractValue = (msg) => {
                        const texts = [];
                        if (msg.content) texts.push(msg.content);
                        if (msg.embeds) {
                            for (const embed of msg.embeds) {
                                if (embed.title) texts.push(embed.title);
                                if (embed.description) texts.push(embed.description);
                                if (embed.footer?.text) texts.push(embed.footer.text);
                                if (embed.author?.name) texts.push(embed.author.name);
                                if (embed.fields) {
                                    for (const field of embed.fields) {
                                        if (field.name) texts.push(field.name);
                                        if (field.value) texts.push(field.value);
                                    }
                                }
                            }
                        }
                        const fullText = texts.join(" ");
                        
                        // Buscar primeiro decimais (ex: 1,00 / 0,55 / 1.00)
                        const decimalRegex = /(\d+[.,]\d+)/g;
                        let match;
                        while ((match = decimalRegex.exec(fullText)) !== null) {
                            let valStr = match[1];
                            let val;
                            if (valStr.includes(',') && valStr.includes('.')) {
                                val = parseFloat(valStr.replace(/\./g, '').replace(',', '.'));
                            } else if (valStr.includes(',')) {
                                val = parseFloat(valStr.replace(',', '.'));
                            } else {
                                val = parseFloat(valStr);
                            }
                            return val;
                        }
                        // Buscar inteiros se não achou decimal
                        const intRegex = /\b(\d+)\b/g;
                        let intMatch;
                        while ((intMatch = intRegex.exec(fullText)) !== null) {
                            const val = parseInt(intMatch[1]);
                            if (val > 0 && val < 10000) return val;
                        }
                        return null;
                    };

                    // Verifica se o valor está dentro do range
                    const shouldClickByValue = (msg) => {
                        // Se nenhum filtro está configurado, clica normalmente
                        if (valorMin === 0 && valorMax === 0) return true;
                        
                        const valor = extractValue(msg);
                        if (valor === null) return true; // Não achou valor, clica normalmente
                        
                        if (valorMin > 0 && valor < valorMin) return false;
                        if (valorMax > 0 && valor > valorMax) return false;
                        return true;
                    };

                    // ═══════════════════════════════════════════════════════════
                    // VARREDURA COMPLETA: varre todas as mensagens, coleta TODOS
                    // os botões válidos livres e clica em cada um deles.
                    // Passagens seguintes nunca clicam no mesmo botão/mensagem.
                    // ═══════════════════════════════════════════════════════════
                    for (const msg of msgArray) {
                        if (!automation.isRunning) break;
                        if (automation.blacklistedGuilds.has(guildId)) break;
                        if ((automation.guildClickCountByMode.get(modeCountKey) || 0) >= modeLimit) break;

                        // Se já clicou nesta mensagem nesta volta do servidor → PULAR
                        const guildClicked = automation.clickedMessagesByGuild.get(guildId);
                        if (guildClicked && guildClicked.has(msg.id)) continue;

                        if (!msg.components?.length) continue;

                        // Verificar filtro de valor
                        if (!shouldClickByValue(msg)) continue;

                        // Coletar TODOS os botões válidos desta mensagem
                        const buttons = [];
                        for (const row of msg.components) {
                            for (const comp of row.components) {
                                if (comp.type === "BUTTON" || comp.customId) {
                                    buttons.push(comp);
                                }
                            }
                        }
                        if (buttons.length === 0) continue;

                        // Tentar CADA botão válido da mensagem
                        for (const button of buttons) {
                            if (!automation.isRunning) break;
                            if (automation.blacklistedGuilds.has(guildId)) break;
                            if ((automation.guildClickCountByMode.get(modeCountKey) || 0) >= modeLimit) break;

                            // Verificar se este botão é o correto para as categorias
                            const match = findCorrectButton([button], searchCategories);
                            if (!match) continue;

                            // Verificar se o bot já está na fila deste botão específico
                            if (isBotInButtonQueue(msg, button.label)) {
                                continue; // Pular este botão, tentar próximo da mensagem
                            }

                            // Pular botões que falharam 3+ vezes consecutivas nesta sessão
                            const failKey = `${msg.id}:${button.label || button.customId}`;
                            const failCount = automation.failedButtons.get(failKey) || 0;
                            if (failCount >= 3) {
                                continue; // Botão com falha persistente, pular
                            }

                            // Clicar!
                            const ok = await doClick(msg, button);
                            if (ok) break; // Só clica 1 botão por mensagem, vai para próxima
                        }
                    }
                } catch (err) {
                    // Erro ao fetchar mensagens ou timeout
                    onLog(`⚠️ Erro ao acessar canal #${channel.name} em ${channel.guild?.name}: ${err.message}`, "warn");
                }
            };

                        // ═══════════════════════════════════════════════════════════
            // LOOP CONTÍNUO DE CLIQUES (apenas cliques em canais de fila)
            // ═══════════════════════════════════════════════════════════
            let serverIndex = 0;

            (async () => {
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

                        // PULAR servidores na blacklist
                        if (automation.blacklistedGuilds.has(currentGuild.id)) {
                            serverIndex++;
                            continue;
                        }

                        // ESCANEAMENTO DE CANAIS DE FILA E CLIQUES
                        const canaisFila = currentGuild.channels.cache.filter(c => {
                            if (c.type !== "GUILD_TEXT") return false;
                            const nome = c.name.toLowerCase();
                            const nomeNormalized = nome.replace(/[-_xv]/g, " ").replace(/\s+/g, " ").trim();
                            const matchesFormat = searchFormats.length === 0 || searchFormats.some(f => nomeNormalized.includes(f));
                            const matchesCategory = searchCategories.length === 0 || searchCategories.some(cat => nome.includes(cat) || nomeNormalized.includes(cat));
                            return matchesFormat && matchesCategory;
                        });

                        for (const [, channel] of canaisFila) {
                            if (!automation.isRunning) break;
                            if (automation.blacklistedGuilds.has(currentGuild.id)) break;
                            if (automation.processing.has(channel.id)) continue;
                            
                            const guildId = channel.guild?.id;
                            // Verificar limite por servidor+modo
                            const channelMode = getChannelMode(channel);
                            const modeCountKey = `${guildId}:${channelMode || "unknown"}`;
                            const modeLimit = automation.limitesPorModoNames[channelMode] || this.MAX_ENTRIES_PER_GUILD;
                            const modeClicks = automation.guildClickCountByMode.get(modeCountKey) || 0;
                            if (modeClicks >= modeLimit) continue;

                            automation.processing.add(channel.id);
                            try {
                                // Adicionar um timeout global para o processamento do canal
                                const processPromise = processChannel(channel);
                                const globalTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout global canal')), 20000));
                                
                                await Promise.race([processPromise, globalTimeout]);
                            } catch (err) {
                                onLog(`⚠️ Canal #${channel.name} ignorado: ${err.message}`, "warn");
                            }
                            setTimeout(() => automation.processing.delete(channel.id), 300);
                        }

                        // Resetar contadores de cliques E mensagens clicadas deste servidor para permitir novo ciclo
                        automation.guildClickCount.delete(currentGuild.id);
                        for (const key of automation.guildClickCountByMode.keys()) {
                            if (key.startsWith(`${currentGuild.id}:`)) {
                                automation.guildClickCountByMode.delete(key);
                            }
                        }
                        automation.clickedMessagesByGuild.delete(currentGuild.id);

                        // Avançar para o próximo servidor
                        serverIndex++;

                        // Quando completou uma volta completa em todos os servidores, limpar apenas caches temporários
                        // clickedMessages NUNCA é limpo - o bot nunca clica no mesmo botão/mensagem de novo na sessão
                        if (serverIndex % guildArray.length === 0) {
                            automation.msgAutoSentThisSession.clear();
                            automation.confirmedChannels.clear();
                        }

                        // Delay mínimo entre servidores (seguro contra rate limit)
                        await new Promise(res => setTimeout(res, 200));
                    } catch (err) {
                        // O loop principal NUNCA deve parar por erro
                        await new Promise(res => setTimeout(res, 3000));
                    }
                }
            })();

            // ═══════════════════════════════════════════════════════════
            // ROTINA PARALELA: MONITORAMENTO DE PARTIDAS
            // Escaneia TODOS os servidores de forma independente,
            // agendando msg/menção/confirmação independente do loop de cliques.
            // ═══════════════════════════════════════════════════════════
            (async () => {
                while (true) {
                    if (!automation.isRunning) break;
                    try {
                        const guilds = self.guilds.cache.filter(g => !g.unavailable);
                        const guildArray = [...guilds.values()];

                        if (guildArray.length === 0) {
                            await new Promise(res => setTimeout(res, 5000));
                            continue;
                        }

                        // Escanear TODOS os servidores procurando canais de partida
                        for (const guild of guildArray) {
                            if (!automation.isRunning) break;
                            if (automation.blacklistedGuilds.has(guild.id)) continue;
                            
                            try {
                                const canaisPartida = guild.channels.cache.filter(channel =>
                                    (channel.type === "GUILD_TEXT" || channel.type === "GUILD_PRIVATE_THREAD") &&
                                    (channel.name?.toLowerCase().includes("aguardando") || 
                                     channel.name?.toLowerCase().includes("partida") || 
                                     channel.name?.toLowerCase().includes("fila")) &&
                                    channel.viewable
                                );

                                for (const [, channel] of canaisPartida) {
                                    if (!automation.isRunning) break;
                                    try {
                                        await scheduleMatchTasks(channel);
                                    } catch (err) {
                                        // Erro ao agendar - ignorar e continuar
                                    }
                                    // Pequeno delay entre canais para não sobrecarregar
                                    await new Promise(res => setTimeout(res, 100));
                                }
                            } catch (err) {
                                // Erro ao processar servidor - continuar para o próximo
                            }
                        }

                        // Limpar flags de msg/menção enviadas para permitir novo ciclo
                        msgSentChannels.clear();
                        mentionSentChannels.clear();

                        // Delay entre ciclos da rotina paralela (10s para não spammar)
                        await new Promise(res => setTimeout(res, 10000));
                    } catch (err) {
                        // A rotina paralela NUNCA deve parar por erro
                        await new Promise(res => setTimeout(res, 5000));
                    }
                }
            })();

        } catch (err) {
            // Erro fatal no _runOriginalLogic - logar mas não crashar
        }
    }

    async stopAutomation(botId, onLog) {
        const automation = this.activeAutomations.get(botId);
        if (!automation) return false;
        
                automation.isRunning = false;
        
        // Cancelar todas as tarefas agendadas
        // (scheduledTasks é acessível via closure do _runOriginalLogic,
        // mas ao parar precisamos esperar as tasks ativas terminarem)
        
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
