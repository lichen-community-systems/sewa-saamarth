/* eslint-env node */

"use strict";

const { google } = require("googleapis");

const fluid = require("../shared/fluidLite.js")();

const serviceAccountKeyFile = "sewa-e-kheti-gcp-488fde37dd14.json";
const sheetId = "1SW5-DdhxQVyT7MM1OTh_LXL4pP-BBYFxbDQ9TRRQ3U4";
const tabName = "Prices";
const allSheets = ["Prices", "Users", "Orders"];

const priceIndex = {
    displayName: "Display",
    code: "Code",
    english: "English",
    measure: "Price Measure",
    price: "Today"
};

const userIndex = ["Name", "ID", "Phone"];

const priceHeaderColumns = 2;
const orderHeaderColumns = 6;

const scope = function ($sewa) {
    const sewa = {};

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

    sewa.getSheetData = async function (googleSheetClient, sheetId, tabName) {
        const res = await googleSheetClient.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: `${tabName}`
        });

        return res.data.values;
    };

    sewa.getAllSheets = async function (googleSheetClient) {
        const outside = Date.now();
        const res = await googleSheetClient.spreadsheets.values.batchGet({
            spreadsheetId: sheetId,
            ranges: allSheets
        });
        console.log("Fetched in " + (Date.now() - outside) + " ms");

        const values = res.data.valueRanges.map(valueRanges => valueRanges.values);
        const hash = values.reduce((map, value, index) => {map[allSheets[index]] = value; return map;}, {});

        return hash;
    };

    sewa.getPriceSheet = async function (googleSheetClient) {
        return await sewa.getSheetData(googleSheetClient, sheetId, tabName);
    };

    // Searches through rows for values in `indexCol` containing text in values of `index`,
    // and returns a hash keyed by keys of `index` with `headerColumns` sliced off
    sewa.indexRowsByColumnKey = function (sheetName, rows, indexCol, index, headerColumns) {
        const col0 = rows.map(row => row[indexCol]);
        const togo = {};
        for (const [code, text] of Object.entries(index)) {
            const index = col0.findIndex(cell => cell.includes(text));
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
    sewa.indexRowsByDirectColumn = function (rows, code) {
        const togo = [];
        return rows.map(row => {
            const togo = {};
            row.forEach((cell, index) => togo[code[index]] = cell);
            return togo;
        });
        return togo;
    };

    sewa.convertPriceData = function (rows) {
        const priceRows = sewa.indexRowsByColumnKey("Prices", rows, 0, priceIndex, priceHeaderColumns);
        const rowsByDate = sewa.pricesByDate(rows, 1, priceHeaderColumns);
        const items = sewa.indexRowsByCode(priceRows, priceRows.code);
        return {
            items,
            codes: priceRows.code,
            byDate: rowsByDate
        };
    };

    sewa.allocateId = function () {
        return (Math.floor(Math.random() * 1e12)).toString(36);
    };

    sewa.convertOneUser = function (row) {
        return {
            name: row[0],
            id: row[1],
            phone: row[2]
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
        const header = row0.slice(0, headerColumns).map(cell => cell.toLowerCase());
        const orders = sewa.indexRowsByDirectColumn(headerRows, header);

        const itemRows = rest.map(row => row.slice(headerColumns));
        const itemHeader = row0.slice(headerColumns);
        const orderItems = sewa.indexRowsByDirectColumn(itemRows, itemHeader);
        orderItems.forEach(items => fluid.remove_if(items, (value => !value)));

        orders.forEach((orderRow, index) => orderRow.items = orderItems[index]);

        return orders;
    };

    sewa.findOrder = function (orders, id, date) {
        return orders.find(order => order.id === id && order.date === date);
    };

    sewa.convertSheets = function (sheets) {
        const prices = sewa.convertPriceData(sheets.Prices);
        const users = sewa.convertUserData(sheets.Users);
        const orders = sewa.convertOrderData(sheets.Orders, orderHeaderColumns);
        return {prices, users, orders};
    };

    sewa.getConvertedSheets = async function () {
        const client = await sewa.getGoogleSheetClient();
        const allData = await sewa.getAllSheets(client);
        const converted = sewa.convertSheets(allData);
        return converted;
    };

    sewa.getCartData = function (converted, id, date) {
        const userRow = converted.users[id] || {};
        const orderRow = sewa.findOrder(converted.orders, id, date);
        return {
            prices: converted.prices,
            user: {
                id: userRow.id,
                name: userRow.name
            },
            order: orderRow
        };
    };

    return {...$sewa, ...sewa};
};

module.exports = scope;
