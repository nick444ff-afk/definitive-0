const sleep = (ms) => new Promise(res => setTimeout(res, ms));

/**
 * Retorna um delay aleatório entre 2000ms (2.0s) e 3500ms (3.5s)
 */
const getClickJitter = () => {
    return Math.floor(2000 + Math.random() * 1500);
};

/**
 * Retorna um delay de observação/foco no canal (1.5s a 4s)
 */
const getObservationDelay = () => {
    return Math.floor(1500 + Math.random() * 2500);
};

/**
 * Retorna um delay de transição entre servidores (3s a 7s)
 */
const getServerTransitionDelay = () => {
    return Math.floor(3000 + Math.random() * 4000);
};

/**
 * Realiza uma entrada real no canal via Gateway usando Opcode 37 (Bulk Subscriptions)
 * O Opcode 37 é o padrão moderno do Discord para 2026.
 */
const enterChannel = async (client, channel) => {
    try {
        if (!channel.guildId) return;
        
        const shard = client.ws.shards.first();
        if (!shard) return;

        // Opcode 37: GUILD_SUBSCRIPTIONS_BULK
        const payload = {
            op: 37,
            d: {
                subscriptions: {
                    [channel.guildId]: {
                        typing: true,
                        threads: true,
                        activities: true,
                        members: [],
                        member_updates: false,
                        channels: {
                            [channel.id]: [[0, 99]]
                        }
                    }
                }
            }
        };

        shard.send(payload);
        
        // Simulação de Lazy Loading de Membros (Opcode 8)
        // Solicita pedaços da lista de membros para parecer que o usuário está rolando a lista
        if (Math.random() > 0.5) {
            const memberPayload = {
                op: 8,
                d: {
                    guild_id: channel.guildId,
                    query: "",
                    limit: 10,
                    presences: true
                }
            };
            shard.send(memberPayload);
        }
    } catch (err) {
        // Silencioso
    }
};

module.exports = {
    sleep,
    getClickJitter,
    getObservationDelay,
    getServerTransitionDelay,
    enterChannel
};
