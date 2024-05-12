/* eslint-env node */

"use strict";

const {accountSid, authToken} = require("../twilio-creds.json");

const client = require("twilio")(accountSid, authToken);

const twilioNumber = "+447883305675";
const mySMSNumber = "+447941884841";
const sewaBurnerNumber = "+447547395817";

const sewa = {};

sewa.sendSMS = async function (target, message) {
    const result = await client.messages
        .create({
            body: message,
            from: twilioNumber,
            to: target
        })
        .then(message => console.log(message.sid));
    return result;
};



sewa.sendSMS(sewaBurnerNumber, "Test Twilio API send another message").then(response => {
    console.log("Send done with response ", response);
});
