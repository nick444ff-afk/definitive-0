module.exports = {
    name: "clientReady",
    run: async(client) => {
        console.clear();
        console.log("\n");
        console.log('> Desenvolvido por @rugalxit7 <');
        console.log(`> Estou online em ${client.user.username} <`);
        console.log(`> Estou em ${client.guilds.cache.size} Servidores <`);
        console.log(`> Tenho acesso ${client.users.cache.size} Usuários <`);
        console.log(`1.0.0 - Sistema de Filas Automatizadas`);
    }
};
