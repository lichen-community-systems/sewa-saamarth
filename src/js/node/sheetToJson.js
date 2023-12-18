const { google } = require("googleapis");
const fs = require("fs");

const serviceAccountKeyFile = "sewa-e-kheti-gcp-488fde37dd14.json";
const sheetId = "1SW5-DdhxQVyT7MM1OTh_LXL4pP-BBYFxbDQ9TRRQ3U4"
const tabName = "Prices"
const range = "1:5"

const outputPrices = "data/prices.json";

const headerColumns = 2;

async function getGoogleSheetClient() {
    const auth = new google.auth.GoogleAuth({
        keyFile: serviceAccountKeyFile,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const authClient = await auth.getClient();
    return google.sheets({
        version: "v4",
        auth: authClient,
    });
}

async function getPriceData(googleSheetClient, sheetId, tabName, range) {
    const res = await googleSheetClient.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${tabName}!${range}`,
    });

    return res.data.values;
}


const writeJSONSync = function (filename, doc) {
    const formatted = JSON.stringify(doc, null, 4) + "\n";
    fs.writeFileSync(filename, formatted);
    console.log("Written " + formatted.length + " bytes to " + filename);
};


const convertPriceData = function (sheetData) {
    const rows = [];
    const codes = sheetData[1];
    codes.slice(headerColumns).forEach(function (code, index) {
        const sheetIndex = index + headerColumns;
        const record = {
            displayName: sheetData[0][sheetIndex],
            code: sheetData[1][sheetIndex],
            english: sheetData[2][sheetIndex],
            measure: sheetData[3][sheetIndex],
            price: sheetData[4][sheetIndex]
        }
        rows.push(record);
    });
    return rows;
}

async function writePriceData() {
    try {
        const now = Date.now();
        const googleSheetClient = await getGoogleSheetClient();
        const sheetData = await getPriceData(googleSheetClient, sheetId, tabName, range);
        console.log("Read " + sheetData.length + " rows in " + (Date.now() - now) + " ms");
        const rowData = convertPriceData(sheetData);
        writeJSONSync(outputPrices, rowData);

    } catch (e) {
        console.log("Got error ", e);
    }

};

writePriceData().then();