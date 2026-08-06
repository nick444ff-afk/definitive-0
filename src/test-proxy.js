const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const proxyUrl = "http://ZeqtntclLJHUMUBP:lf4gZBZfypVxq0zs_cou@geo.iproyal.com:12321";
const agent = new HttpsProxyAgent(proxyUrl);

async function checkIP() {
    try {
        const response = await axios.get('https://api.ipify.org?format=json', { 
            httpsAgent: agent,
            timeout: 15000 
        });
        console.log("IP Detectado:", response.data.ip);
    } catch (error) {
        console.error("Erro:", error.message);
    }
}

checkIP();
