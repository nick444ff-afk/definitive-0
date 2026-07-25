const { JsonDatabase } = require("wio.db");
const { QuickDB } = require("quick.db");
const { owner } = require("../../config.json");

const us = new JsonDatabase({ databasePath: "./src/databases/users.json" });
const lg = new QuickDB({ filePath: "./src/databases/logs.sqlite" });

module.exports = {
    us,
    lg,
    owner
};
