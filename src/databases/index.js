const { JsonDatabase } = require("wio.db");
const { QuickDB } = require("quick.db");
const { owner } = require("../../config.json");

const path = require("path");
const us = new JsonDatabase({ databasePath: path.join(__dirname, "users.json") });
const lg = new QuickDB({ filePath: path.join(__dirname, "logs.sqlite") });

module.exports = {
    us,
    lg,
    owner
};
