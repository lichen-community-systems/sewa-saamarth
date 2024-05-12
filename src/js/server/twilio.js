/* eslint-env node */

"use strict";

const {accountSid, authToken, fromNumber} = require("../../../twilio-creds.json");

const client = require("twilio")(accountSid, authToken);

const sendSMS = async function (target, message) {
    const result = await client.messages
        .create({
            body: message,
            from: fromNumber,
            to: target
        })
        .then(message => console.log(message.sid));
    return result;
};


module.exports = {sendSMS};
