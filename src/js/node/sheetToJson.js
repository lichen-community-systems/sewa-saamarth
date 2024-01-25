/* eslint-env node */

"use strict";

const fs = require("fs");

const outputCart = "data/cart-c3kptdg1.json";

const scope = function ($sewa) {
    const sewa = {};

    sewa.writeJSONSync = function (filename, doc) {
        const formatted = JSON.stringify(doc, null, 4) + "\n";
        fs.writeFileSync(filename, formatted);
        console.log("Written " + formatted.length + " bytes to " + filename);
    };

    sewa.writePriceData = async function () {
        try {
            const client = await $sewa.getGoogleSheetClient();
            const allData = await $sewa.getAllSheets(client);
            sewa.writeJSONSync("scratch/allSheets.json", allData);
            const converted = $sewa.convertSheets(allData);
            sewa.writeJSONSync("scratch/converted.json", converted);
            const cart = $sewa.getCartData(converted, "c3kptdg1", "18/12/23");
            sewa.writeJSONSync(outputCart, cart);

        } catch (e) {
            console.log("Got error ", e);
        }

    };
    return {...$sewa, ...sewa};
};

const sewa = scope(require("./sewaSheets.js")({}));

sewa.writePriceData().then();

module.exports = scope;

