/* eslint-env node */

"use strict";

const express = require("express"),
    http = require("http"),
    https = require("https"),
    basicAuth = require("express-basic-auth"),
    JSON5 = require("json5");

const {h} = require("preact");
const {render} = require("preact-render-to-string");
const fs = require("fs");
const htm = require("htm");

const html = htm.bind(h);
const {signal, computed} = require("@preact/signals");

const libEnv = {html, signal, computed};

const env = require("../shared/cart.js")(libEnv);

const sewaSheetsScope = require("../node/sewaSheets.js");
const sewa = sewaSheetsScope(env.sewa);

const fluid = require("../shared/fluidLite.js")();

const {parseDocument} = require("../node/doc.js");
const {logger, loggerMiddleware} = require("./logging.js");
const {sendSMS} = require("./twilio.js");


const readJSONSync = function (path) {
    return JSON.parse(fs.readFileSync(path, "utf8"));
};

const readJSON5Sync = function (path) {
    return JSON5.parse(fs.readFileSync(path, "utf8"));
};

const replaceNodeText = function (document, selector, text) {
    const node = document.querySelector(selector);
    node.textContent = text;
};

const serverConfig = readJSON5Sync("serverConfig.json5");
const users = readJSON5Sync("passwords.json5");

const authMiddleware = basicAuth({ users, challenge: true});

const htmlHeader = `
<!DOCTYPE html>
<html>
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">`;

const fetchAllDocs = async function (googleSheetClient, config) {
    const tenantConfig = config.tenantConfig;
    return await fluid.asyncTransform(tenantConfig, async tenant => {
        if (!config.mock) {
            const allSheets = await sewa.getAllSheets(googleSheetClient, tenant.doc);
            return sewa.convertSheets(allSheets);
        } else {
            return readJSONSync(tenant.convertedMock);
        }
    });
};

const dumpOrderForSMS = function (order) {
    // This is a "submitted order" rather than an order received from persistence
    const itemList = order.items.map(item => {
        return `${item.orderQuantity}${item.orderMeasure} ${item.code}`;
    });
    const items = itemList.join("\n");
    return `SEWA Saamarth order placed by ${order.name} value INR${order.value}, items:\n${items}`;
};

const notifySMSOrder = async function (users, order) {
    try {
        const toNotify = Object.values(users).filter(user => user.notify === "TRUE");
        const rendered = dumpOrderForSMS(order);
        await fluid.asyncForEach(toNotify, async function (oneUser) {
            const E164 = "+" + oneUser.phone;
            logger.info("Notifing user " + oneUser.name + " at number " + E164);
            await sendSMS(E164, rendered);
        });
    } catch (e) {
        logger.error("Error sending SMS message: ", e);
    }
};

const makeApp = async function (googleSheetClient, config) {
    const tenantConfig = config.tenantConfig;

    let allDocs = await fetchAllDocs(googleSheetClient, config);

    const app = express();
    app.use(loggerMiddleware);

    app.use("/favicon.ico", express.static("docs/favicon.ico"));
    app.use("/lib", express.static("docs/lib"));
    app.use("/js", express.static("docs/js"));
    app.use("/img", express.static("docs/img"));
    app.use("/css", express.static("docs/css"));
    app.use("/data", express.static("docs/data"));

    app.get("/", authMiddleware, async (req, res) => {
        allDocs = await fetchAllDocs(googleSheetClient, config);
        // TODO: Needs to load dynamically
        const title = "SEWA Saamarth Admin Cart Index";
        let response = htmlHeader + `<link rel="stylesheet" href="css/index.css" />
                    <title>${title}</title>
                </head><body><h1>${title}</h1>`;
        fluid.each(allDocs, (doc, tenant) => {
            response += `<h2>Tenant: ${tenantConfig[tenant].name}</h2>`;
            const pricesLink = `/${tenant}/prices`;
            response += `<div class="index-prices">Prices link for pasting to WhatsApp: <a href="${pricesLink}">${pricesLink}</a></div>`;
            response += `<div class="index-table">`;
            response += `<div class="index-row index-header"><div>User</div><div>Cart Link</div><div>Orders Link</div></div>`;
            fluid.each(doc.users, (rec, userid) => {
                const cartLink = `/${tenant}/cart/${userid}`;
                const ordersLink = `/${tenant}/orders/${userid}`;
                response += `
                    <div class="index-row">
                        <div>${rec.name}</div>
                        <div><a href="${cartLink}">${cartLink}</a></div>
                        <div><a href="${ordersLink}">${ordersLink}</a></div>
                    </div>`;
            });
            response += `</div>`;
        });
        response += "</body></html>";

        res.send(response);
    });

    app.get("/:tenant/prices", async (req, res) => {
        const tenant = tenantConfig[req.params.tenant];
        const title = `SEWA Saamarth Prices Table for ${tenant.name}`;
        let response = htmlHeader + `<link rel="stylesheet" href="../css/index.css" />
                    <title>${title}</title>
                </head><body><h1>${title}</h1>`;

        const today = sewa.today();
        response += `Date: ${today} (1kg)`;

        const cart = await sewa.getCartData(googleSheetClient, tenant.doc, "xxxxxxxx", today);
        // Quickest way to get row of prices in order
        const model = sewa.modelisePrices(cart.cartData);

        if (model.rows.length > 0) {
            model.rows.forEach(row => {
                response += `<div>${row.displayName}: ₹ ${row.price}</div>`;
            });
        } else {
            response += `<p>No items for sale today, set up in 'Prices' tab at
                <a href="https://docs.google.com/spreadsheets/d/${tenant.doc}/edit">Working Sheet</a></p>`;
        }

        response += "</body></html>";

        res.send(response);

    });

    app.get("/:tenant/cart/:userId.json", async (req, res) => {
        const tenant = tenantConfig[req.params.tenant];
        const userId = req.params.userId;
        const today = sewa.today();

        const cart = await sewa.getCartData(googleSheetClient, tenant.doc, userId, today);
        res.json(cart.cartData);
    });

    app.get("/:tenant/cart/:userId", async (req, res) => {

        const template = parseDocument("docs/template/cart.html");

        const tenant = tenantConfig[req.params.tenant];
        const userId = req.params.userId;

        const fetchNode = template.querySelector("#loadCart");

        if (config.isomorphic) {
            let cart;
            if (config.mock) {
                cart = JSON.parse(fs.readFileSync("data/cart-c3kptdg1.json", "utf8"));
            } else {
                const today = sewa.today();
                const allCart = await sewa.getCartData(googleSheetClient, tenant.doc, userId, today);
                cart = allCart.cartData;
            }

            const model = sewa.modelisePrices(cart);
            const relativePath = "../../..";

            const nodes = html`
                <${sewa.Cart} model=${model} relativePath=${relativePath}/>`;

            const rendered = render(nodes);

            const target = template.querySelector("#cart");
            target.innerHTML = rendered;
            fetchNode.innerHTML = `sewa.cart = ${JSON.stringify(cart)}`;
        } else {
            const jsonURL = req.url + ".json";
            fetchNode.innerHTML = `sewa.cart = sewa.fetchJSON("${jsonURL}");`;
        }

        const submitNode = template.querySelector("#submitCart");
        submitNode.innerHTML = `
            sewa.submitCart = "${req.url.replace("cart", "order")}";
            sewa.cartRelativePath = "../..";
            `;

        const outMarkup = "<!DOCTYPE html>" + template.documentElement.outerHTML;

        res.send(outMarkup);
    });

    app.post("/:tenant/order/:userId", express.json(), async (req, res) => {
        const tenant = tenantConfig[req.params.tenant];
        const userId = req.params.userId;
        const today = sewa.today();

        const allSheets = await sewa.getAllSheets(googleSheetClient, tenant.doc);
        const converted = sewa.convertSheets(allSheets);

        const orderSheet = allSheets.Orders;

        const payload = req.body;
        console.log("Got payload ", payload);

        const orderHeaderItems = orderSheet[0].slice(sewa.orderHeaderColumns);

        let maxIndex = -1;
        // Lookup of item code to index in orders header
        const itemIndex = {};
        orderHeaderItems.forEach( (code, index) => {
            if (code) {
                itemIndex[code] = index;
                maxIndex = Math.max(maxIndex, index);
            }
        });

        let nextIndex = maxIndex + 1;

        const orderItems = payload.items;
        const newItems = [];
        orderItems.forEach(item => {
            const existingIndex = itemIndex[item.code];
            if (existingIndex !== undefined) {
                item.columnIndex = existingIndex;
            } else {
                item.columnIndex = nextIndex;
                orderHeaderItems[nextIndex] = item.code;
                newItems.push(item.code);
                ++nextIndex;
            }
        });

        if (newItems.length > 0) {
            const newRow0 = [... orderSheet[0].slice(0, sewa.orderHeaderColumns), ...orderHeaderItems];
            console.log(`Found ${newItems.length} new items `, newItems, "posting new Orders row 0 ", newRow0);
            await sewa.updateSheetRow(googleSheetClient, tenant.doc, "Orders", newRow0, 0);
        }

        const cart = await sewa.getCartData(googleSheetClient, tenant.doc, userId, today);
        let orderNumber;
        if (cart.cartData.currentOrder) {
            orderNumber = cart.cartData.currentOrder.orderNumber;
        } else {
            const maxOrderNumber = converted.orders.reduce((a, order) => Math.max(a, order.orderNumber), 0);
            orderNumber = maxOrderNumber + 1;
        }
        const orderLeftHash = {
            orderNumber: orderNumber,
            date: today,
            name: payload.user.name,
            userId: payload.user.id,
            value: payload.orderPrice,
            paid: "FALSE"
            // TODO: We'll obliterate feedback if we update an order
        };
        const orderLeft = sewa.orderSchema.map(col => orderLeftHash[col]);

        const orderRight = [];
        orderItems.forEach(item => {
            // Only store the order measure in the cell if it is different from the price measure - to avoid corruption such as
            // with e.g. bananas where priceMeasure is "10pcs" which can't be separated from the orderQuantity
            const leftMeasure = item.orderMeasure === item.priceMeasure ? "" : item.orderMeasure;
            orderRight[item.columnIndex] = item.orderQuantity + leftMeasure + "@" + item.price + "/" + item.priceMeasure;
        });

        const newRow = [...orderLeft, ...orderRight];
        logger.info("Posting order row ", newRow, " to spreadsheet");

        if (cart.cartData.currentOrder) {
            const rowIndex = cart.cartData.currentOrderIndex;
            console.log(`Amending existing order with number ${orderNumber} at row ${rowIndex}`);

            await sewa.updateSheetRow(googleSheetClient, tenant.doc, "Orders", newRow, rowIndex + 1);
        } else {
            // TODO: Add checkbox using https://webapps.stackexchange.com/questions/121502/how-to-add-checkboxes-into-cell-using-google-sheets-api-v4
            console.log(`Adding in new order with number ${orderNumber}`);

            await sewa.appendSheetRow(googleSheetClient, tenant.doc, "Orders", newRow);
        }

        const response = {
            redirect: req.url.replace("order", "orders")
        };
        res.json(response);

        const orderMock = {...orderLeftHash, ...{items: payload.items}};

        process.nextTick(() => {
            notifySMSOrder(converted.users, orderMock);
        });
    });

    app.get("/:tenant/orders/:userId", async (req, res) => {

        const template = parseDocument("docs/template/orders.html");

        const tenant = tenantConfig[req.params.tenant];
        const userId = req.params.userId;
        const today = sewa.today();

        const {converted, cartData} = await sewa.getCartData(googleSheetClient, tenant.doc, userId, today);

        const userOrders = converted.orders.filter(row => row.userId === userId);

        const todayOrderIndex = userOrders.findIndex(row => row.date === today);
        const todayOrder = userOrders[todayOrderIndex];

        if (todayOrderIndex !== -1) {
            userOrders.splice(todayOrderIndex, 1);
        }

        const dumpOrderItems = function (order) {
            const header = `<div class="orders-header">
                <div class="row-img"></div>
                <div class="row-name">Item</div>
                <div class="row-price">Item Price</div>
                <div class="row-quantity">Quantity</div>
                <div class="row-order-price">Price</div>
            </div>`;
            const rows = Object.entries(order.items).map(([code, qp]) => {
                const {cellQuantity, cellPrice} = sewa.parseOrderCell(qp);
                return dumpOrderItem(code, cellQuantity, cellPrice, order.orderNumber);
            });
            return [header, ...rows].join("\n");
        };

        const dumpOrderItem = function (code, cellQuantity, cellPrice, orderNumber) {
            const item = converted.prices.items[code] || {};
            if (!item.displayName) {
                logger.error(`Unknown item in order #${orderNumber} with code ${code}`);
            }
            const {itemPrice, priceMeasure} = sewa.parseCellPrice(cellPrice);
            const parsedMeasure = sewa.parseMeasure(priceMeasure);
            const {orderQuantity} = sewa.parseCellQuantity(cellQuantity);

            return `<div class="row-item" data-row="${code}">
                        <img class="row-img" src="../../../img/small/${code}.jpg"/>
                        <div class="row-name">${item.displayName || "[unknown item]"}</div>
                        <div class="row-price">₹${itemPrice} / ${parsedMeasure.priceMeasure}</div>
                        <div class="row-quantity">${cellQuantity}</div>
                        <div class="row-order-price">₹${sewa.computeOrderPrice(orderQuantity, parsedMeasure, itemPrice)}</div>
                    </div>`;
        };

        const title = `SEWA Saamarth orders for ${cartData.user.name}`;

        replaceNodeText(template, "title", title);
        replaceNodeText(template, "h1", title);

        let content = "";

        if (todayOrder) {
            if (todayOrder.paid === "TRUE") {
                content += `
                    <div class="order-pay">
                        <div class="order-pay-text">Thank you for today's order. Your payment has been received.</div>
                    </div>
                    <div class="order-feedback"></div>`;
            } else {
                content += `
                    <div class="order-pay">
                        <div class="order-pay-text"><p>Thank you for today's order. Please pay the total of <span class="order-total">${todayOrder.value}</span>
                        with SEWA's UPI code:</p><p>You may also pay with cash on delivery.</p></div>
                      
                        <a href="upi://pay?pa=paytmqr16v4z4rw8j@paytm&pn=Paytm"><div class="sewa-upi"></div></a>
                    </div>
                    <div class="order-feedback"></div>`;
            }
            content += `<div class="order-items">${dumpOrderItems(todayOrder)}</div>`;

            const feedbackUrl = `/${req.params.tenant}/orderFeedback/${userId}/${todayOrder.orderNumber}`;
            content += `<script>
                sewa.makeOrderFeedbackClient(".order-feedback", {
                    feedbackUrl: "${feedbackUrl}",
                    rating: ${todayOrder.rating || 0},
                    feedbackText: "${todayOrder.feedbackText}"
                    }
                );
                </script>`;
        }

        if (userOrders.length > 0) {
            content += `<h2>Past Orders:</h2>`;

            userOrders.forEach(order => {
                content += `<div class="past-order">
                    <div class="past-order-header">
                    <div class="past-order-placed"><div>Order placed</div><div>${order.date}</div></div>
                    <div class="past-order-total"><div>Total</div><div>${order.value}</div></div>
                    <div class="past-order-number"><div>Order #${order.orderNumber}</div></div>
                </div>`;
                content += `<div class="order-items">${dumpOrderItems(order)}</div>
                </div>`;
            });
        }

        template.querySelector(".content").innerHTML = content;

        const outMarkup = "<!DOCTYPE html>" + template.documentElement.outerHTML;
        res.send(outMarkup);
    });

    app.post("/:tenant/orderFeedback/:userId/:orderNumber", express.json(), async (req, res) => {
        const tenant = tenantConfig[req.params.tenant];
        const userId = req.params.userId;
        const orderNumber = req.params.orderNumber;

        const payload = req.body;
        console.log("Got payload ", payload);

        const allSheets = await sewa.getAllSheets(googleSheetClient, tenant.doc);
        const converted = sewa.convertSheets(allSheets);

        const orderIndex = converted.orders.findIndex(order =>
            order.orderNumber === orderNumber && order.userId === userId);

        if (orderIndex === -1) {
            res.json({isError: true, message: `Order number ${orderNumber} not found for user ${userId}`});
        } else {
            const orderSheet = allSheets.Orders;
            const oldRow = orderSheet[orderIndex + 1];
            const newRow = [...oldRow];
            console.log("Updating row ", oldRow);
            const ratingIndex = sewa.orderSchema.indexOf("rating");
            newRow[ratingIndex] = payload.rating;
            const feedbackIndex = sewa.orderSchema.indexOf("feedbackText");
            newRow[feedbackIndex] = payload.feedbackText;

            await sewa.updateSheetRow(googleSheetClient, tenant.doc, "Orders", newRow, orderIndex + 1);

            res.json({message: `Feedback for order ${orderNumber} recorded`});
        }
    });
    return app;
};

const loadCerts = function (options) {
    return {
        key: fs.readFileSync(options.key),
        cert: fs.readFileSync(options.cert)
    };
};

const startServer = async function (config) {
    const client = await sewa.getGoogleSheetClient();
    const app = await makeApp(client, serverConfig);

    const server = config.protocol === "http" ? http.createServer(app) :
        https.createServer(loadCerts(config.serverOptions), app);

    const port = config.port;

    server.listen(port);
    console.log(`Listening on ${config.protocol} on port ${port}`);

    return {client, app};
};

startServer(serverConfig).then();
