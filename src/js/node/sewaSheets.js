/* eslint-env node */

"use strict";

const { google } = require("googleapis");

const fluid = require("../shared/fluidLite.js")();

const serviceAccountKeyFile = "sewa-e-kheti-gcp-488fde37dd14.json";
const lilotriSheetId = "1SW5-DdhxQVyT7MM1OTh_LXL4pP-BBYFxbDQ9TRRQ3U4";
const allSheets = ["Prices", "Users", "Orders"];

const priceIndex = {
    displayName: "Display",
    code: "Code",
    english: "English",
    measure: "Price Measure",
    price: "Today",
    minimumOrder: "Minimum"
};

const userIndex = ["Name", "ID", "Phone"];

const scope = function ($sewa) {
    const sewa = {};

    sewa.priceHeaderColumns = 3;

    // Schema for the first 8 columns of "Orders" sheet
    sewa.orderSchema = [
        "orderNumber",
        "date",
        "name",
        "userId",
        "value",
        "paid",
        "rating",
        "feedbackText"
    ];

    sewa.orderHeaderColumns = sewa.orderSchema.length;

    sewa.lilotriSheetId = lilotriSheetId;

    sewa.getGoogleSheetClient = async function () {
        const auth = new google.auth.GoogleAuth({
            keyFile: serviceAccountKeyFile,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"]
        });
        const authClient = await auth.getClient();
        return google.sheets({
            version: "v4",
            auth: authClient
        });
    };

    // Get data for a single Google sheet - currently disused in favour of getAllSheets and batchGet
    sewa.getSheetData = async function (googleSheetClient, sheetId, tabName) {
        const res = await googleSheetClient.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: `${tabName}`
        });

        return res.data.values;
    };

    sewa.appendSheetRow = async function (googleSheetClient, sheetId, tabName, row) {
        // Taken from https://stackoverflow.com/questions/37331756/google-sheets-api-v4-how-to-get-the-last-row-with-value/66083125#6608312
        const table = {
            "majorDimension": "ROWS",
            "values": [row]
        };
        const res = await googleSheetClient.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: `${tabName}`,
            valueInputOption: "USER_ENTERED",
            insertDataOption: "INSERT_ROWS",
            resource: table
        });

        console.log("Got append response data ", res.data);
        return res;
    };

    sewa.updateSheetRow = async function (googleSheetClient, sheetId, tabName, row, rowIndex) {
        // On ranges: https://googlesheets4.tidyverse.org/articles/range-specification.html
        const table = {
            "majorDimension": "ROWS",
            "values": [row]
        };
        const srow = rowIndex + 1;
        // from here https://stackoverflow.com/questions/46049039/google-sheets-api-v4-values-update-syntax
        const res = await googleSheetClient.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `${tabName}!${srow}:${srow}`,
            valueInputOption: "USER_ENTERED",
            resource: table
        });

        console.log("Got append response data ", res.data);
        return res;
    };


    sewa.getAllSheets = async function (googleSheetClient, sheetId) {
        const outside = Date.now();
        const res = await googleSheetClient.spreadsheets.values.batchGet({
            spreadsheetId: sheetId,
            ranges: allSheets
        });
        console.log("Fetched doc " + sheetId + " in " + (Date.now() - outside) + " ms");

        const values = res.data.valueRanges.map(valueRanges => valueRanges.values);
        const hash = values.reduce((map, value, index) => {map[allSheets[index]] = value; return map;}, {});

        return hash;
    };

    // Searches through rows for values in `indexCol` containing text in values of `index`,
    // and returns a hash keyed by keys of `index` with `headerColumns` sliced off
    sewa.indexRowsByColumnKey = function (sheetName, rows, indexCol, index, headerColumns) {
        const col0 = rows.map(row => row[indexCol]);
        const togo = {};
        for (const [code, text] of Object.entries(index)) {
            const index = col0.findIndex(cell => cell?.includes(text));
            if (index === -1) {
                console.log(`Error in ${sheetName}: expected row with text ${text} not found`);
            } else {
                togo[code] = rows[index].slice(headerColumns);
            }
        }
        return togo;
    };

    // Converts rows of historical prices with dates in `indexCol` into a hash indexed by date, with values being the raw
    // rows - these would later need to be converted using sewa.indexRowsByColumnKey
    sewa.pricesByDate = function (rows, indexCol, headerColumns) {
        const col1 = rows.map(row => row[indexCol]);
        const togo = {};
        col1.forEach((cell, index) => {
            if (cell) {
                togo[cell] = rows[index].slice(headerColumns);
            }
        });
        return togo;
    };

    // We didn't leave room in the schema for anything other than prices, in a hurry creating this extra hash
    sewa.cutoffsByDate = function (rows, indexCol, cutoffColumn) {
        const col1 = rows.map(row => row[indexCol]);
        const togo = {};
        col1.forEach((cell, index) => {
            if (cell) {
                togo[cell] = rows[index][cutoffColumn];
            }
        });
        return togo;
    };

    // Accepts output of sewa.indexRowsByColumnKey which is a hash of arrays and condenses into hashes keyed by `code`
    sewa.indexRowsByCode = function (rows, code) {
        const togo = {};
        code.forEach(code => togo[code] = {});
        for (const [fieldName, row] of Object.entries(rows)) {
            row.forEach((cell, index) =>
                togo[code[index]][fieldName] = cell
            );
        }
        return togo;
    };

    // Accepts rows as array and returns array of hashes
    sewa.indexRowsByDirectColumn = function (rows, codes) {
        const togo = [];
        return rows.map(row => {
            const togo = {};
            row.forEach((cell, index) => togo[codes[index]] = cell);
            return togo;
        });
        return togo;
    };

    sewa.convertPriceData = function (rows) {
        const priceRows = sewa.indexRowsByColumnKey("Prices", rows, 0, priceIndex, sewa.priceHeaderColumns);
        const rowsByDate = sewa.pricesByDate(rows, 1, sewa.priceHeaderColumns);
        const cutoffsByDate = sewa.cutoffsByDate(rows, 1, 2);
        const items = sewa.indexRowsByCode(priceRows, priceRows.code);
        return {
            items,
            codes: priceRows.code,
            byDate: rowsByDate,
            cutoffsByDate
        };
    };

    sewa.allocateId = function () {
        return (Math.floor(Math.random() * 1e12)).toString(36);
    };

    sewa.convertOneUser = function (row) {
        return {
            name: row[0],
            id: row[1],
            phone: row[2],
            notify: row[3]
        };
    };

    sewa.convertUserData = function (rows) {
        const row0 = rows[0];
        userIndex.forEach((value, index) => {
            if (value !== row0[index]) {
                console.log(`Error in Users sheet: expected column ${value} at index ${index}`);
            }
        });
        const rest = rows.slice(1);
        const togo = {};

        rest.forEach(row => {
            const obj = sewa.convertOneUser(row);
            togo[obj.id] = obj;
        });
        return togo;
    };

    sewa.convertOrderData = function (rows, headerColumns) {
        const row0 = rows[0];
        const rest = rows.slice(1);

        const headerRows = rest.map(row => row.slice(0, headerColumns));
        const orders = sewa.indexRowsByDirectColumn(headerRows, sewa.orderSchema);

        const itemRows = rest.map(row => row.slice(headerColumns));
        const itemHeader = row0.slice(headerColumns);
        const orderItems = sewa.indexRowsByDirectColumn(itemRows, itemHeader);
        orderItems.forEach(items => fluid.remove_if(items, (value => !value)));

        orders.forEach((orderRow, index) => orderRow.items = orderItems[index]);

        return orders;
    };

    sewa.findOrder = function (orders, userId, date) {
        const index = orders.findIndex(order => order.userId === userId && order.date === date);
        return {
            index,
            order: index === -1 ? null : orders[index]
        };
    };

    sewa.convertSheets = function (sheets) {
        const prices = sewa.convertPriceData(sheets.Prices);
        const users = sewa.convertUserData(sheets.Users);
        const orders = sewa.convertOrderData(sheets.Orders, sewa.orderHeaderColumns);
        return {prices, users, orders};
    };

    sewa.convertCartData = function (converted, userId, date) {
        const userRow = converted.users[userId] || {};
        const orderRow = sewa.findOrder(converted.orders, userId, date);
        // TODO: look up prices.byDate by date rather than sending all to the client

        return {
            prices: converted.prices,
            date: date,
            user: {
                id: userRow.id,
                name: userRow.name
            },
            currentOrder: orderRow.order,
            currentOrderIndex: orderRow.index
        };
    };

    sewa.getCartData = async function (googleSheetClient, sheetId, userId, date) {
        const allData = await sewa.getAllSheets(googleSheetClient, sheetId);
        const converted = sewa.convertSheets(allData);

        return {
            allData,
            converted,
            cartData: sewa.convertCartData(converted, userId, date)
        };
    };

    return {...$sewa, ...sewa};
};

module.exports = scope;
