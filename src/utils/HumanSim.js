const sleep = (ms) => new Promise(res => setTimeout(res, ms));

/**
 * Retorna um delay aleatório entre min e max ms
 */
const getRandomDelay = (min, max) => {
    return Math.floor(min + Math.random() * (max - min));
};

/**
 * Delays solicitados pelo usuário
 */
const getLoginDelay = () => getRandomDelay(3000, 7000);
const getScanDelay = () => getRandomDelay(5000, 10000);
const getChannelDelay = () => getRandomDelay(1000, 2000);
const getClickDelay = () => getRandomDelay(1000, 2000);
const getServerSwitchDelay = () => getRandomDelay(1000, 2000);

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
    getRandomDelay,
    getLoginDelay,
    getScanDelay,
    getChannelDelay,
    getClickDelay,
    getServerSwitchDelay,
    enterChannel
};
