const sleep = (ms) => new Promise(res => setTimeout(res, ms));

/**
 * Retorna um delay aleatório entre 2000ms (2.0s) e 3500ms (3.5s)
 */
const getClickJitter = () => {
    return Math.floor(2000 + Math.random() * 1500);
};

module.exports = {
    sleep,
    getClickJitter
};
