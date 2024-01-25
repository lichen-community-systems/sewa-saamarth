const https = require("https");

exports.handler = async (event, context, callback)  => {
    const VERIFY_TOKEN = "lilu-lashan";
    const WHATSAPP_TOKEN = "EAAyZAdwqfqN8BO8nDogrdiAwLG7Ikfh0BYlaHBHKZACK128MrCtXtZCf1hv2C1htOfyIQpj6hzRMy8X8swSpapy5PubvHJmp8jOdbK326eCMSW88tbuF8ljfdDGndTl9NOG8QV3aHIimzNMoJgbOAnZAaiNQZA3QzI2sj4IN9oNqQUUr2hMqv4dSA6zfPLnR7GbCuIz6ZAcXI6JRbayTEemKgZD";

    let response;
    console.log("Incoming request type ", event?.requestContext?.http?.method);
    if (event?.requestContext?.http?.method === "GET") {
        // https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
        // to learn more about GET request for webhook verification
        let queryParams = event?.queryStringParameters;
        console.log("Got queryParams ", queryParams);
        if (queryParams != null) {
            const mode = queryParams["hub.mode"];
            if (mode == "subscribe") {
                const verifyToken = queryParams["hub.verify_token"];
                if (verifyToken == VERIFY_TOKEN) {
                    let challenge = queryParams["hub.challenge"];
                    response = {
                        "statusCode": 200,
                        "body": parseInt(challenge),
                        "isBase64Encoded": false
                    };
                } else {
                    const responseBody = "Error, wrong validation token";
                    response = {
                        "statusCode": 403,
                        "body": JSON.stringify(responseBody),
                        "isBase64Encoded": false
                    };
                }
            } else {
                const responseBody = "Error, wrong mode";
                response = {
                    "statusCode": 403,
                    "body": JSON.stringify(responseBody),
                    "isBase64Encoded": false
                };
            }
        }
        else {
            const responseBody = "Error, no query parameters";
            response = {
                "statusCode": 403,
                "body": JSON.stringify(responseBody),
                "isBase64Encoded": false
            };
        }
    } else if (event?.requestContext?.http?.method === "POST") {
        // process POST request (WhatsApp chat messages)
        // https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples#text-messages
        // to learn about WhatsApp text message payload structure
        console.log("Got POST with body ", event.body)
        let body = JSON.parse(event.body)
        let entries = body.entry;
        for (let entry of entries) {
            for (let change of entry.changes) {
                let value = change.value;
                if(value != null) {
                    let phone_number_id = value.metadata.phone_number_id;
                    if (value.messages != null) {
                        for (let message of value.messages) {
                            if (message.type === 'text') {
                                let from = message.from;
                                let message_body = message.text.body;
                                let reply_message = "Ack from AWS lambda: " + message_body;
                                console.log("About to send reply ", reply_message);
                                await sendReply(phone_number_id, WHATSAPP_TOKEN, from, reply_message);
                                const responseBody = "Done";
                                response = {
                                    "statusCode": 200,
                                    "body": JSON.stringify(responseBody),
                                    "isBase64Encoded": false
                                };
                            }
                        }
                    }
                }
            }
        }
    } else {
        const responseBody = "Unsupported method";
        response = {
            "statusCode": 403,
            "body": JSON.stringify(responseBody),
            "isBase64Encoded": false
        };
    }
    console.log("Sent response ", response)

    return response;
}

const sendReply = (phone_number_id, whatsapp_token, to, reply_message) => {
    return new Promise((resolve, reject) => {
        let json = {
            messaging_product: "whatsapp",
            to: to,
            text: { body: reply_message },
            type: "text"
        };
        let data = JSON.stringify(json);
        let path = "/v17.0/" + phone_number_id + "/messages";
        let options = {
            host: "graph.facebook.com",
            path: path,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + whatsapp_token
            }
        };
        let callback = (response) => {
            let str = "";
            response.on("data", (chunk) => {
                console.log("Got data chunk ", chunk)
                str += chunk;
            });
            response.on("end", () => {
                console.log("Received HTTP response data ", str)
                resolve(str);
            });
        };
        console.log("Sending HTTP request with options ", options);
        let req = https.request(options, callback);
        req.on("error", (e) => {
            console.log("Received HTTP error ", e);
            reject(e);
        });
        req.write(data);
        console.log("Written HTTP data ", data)
        req.end();
    });
}