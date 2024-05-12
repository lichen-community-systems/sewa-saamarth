/* eslint-env node */

"use strict";

const axios = require("axios");

const keyFile = require("../mysmskey.json");

const mySMSNumber = "447941884841";
const sewaBurnerNumber = "447547395817";

console.log("Got key ", keyFile.key);

const sewa = {};

//curl -d '{ "apiKey": "'$apikey'", "msisdn": "'$from'", "password": "'$pwd'", "checkKey": "false" }' -H "Content-Type: application/json" -X POST "https://api.mysms.com/json/user/login"

sewa.getMySMSAuthToken = async function (apiKey, msisdn, password) {
    const body = {
        apiKey,
        msisdn,
        password,
        checkKey: false
    };
    console.log("Sending body ", body);
    const response = await axios.post("https://api.mysms.com/json/user/login", body);
    console.log("Got response ", response);

    return response.data;
};

sewa.sendSMS = async function (target, message, key) {
    const token = await sewa.getMySMSAuthToken(keyFile.key, mySMSNumber, keyFile.password);
    console.log("Got token ", token);

    return token;
};





sewa.sendSMS(sewaBurnerNumber, "Test mysms API send message", keyFile.key).then(response => {
    console.log("Send done with response ", response);
});
