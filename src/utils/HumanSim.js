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
 * Realiza uma entrada real no canal via Gateway (Opcode 14)
 * Simula o Lazy Loading de membros para indetectabilidade.
 */
const enterChannel = async (client, channel) => {
    try {
        if (!channel.guildId) return;
        
        const shard = client.ws.shards.first();
        if (!shard) return;

        const payload = {
            op: 14,
            d: {
                guild_id: channel.guildId,
                typing: true,
                activities: true,
                threads: true,
                channels: {
                    [channel.id]: [[0, 99]]
                }
            }
        };

        shard.send(payload);
    } catch (err) {
        // Silencioso para não interromper o fluxo
    }
};

module.exports = {
    sleep,
    getClickJitter,
    getObservationDelay,
    enterChannel
};
