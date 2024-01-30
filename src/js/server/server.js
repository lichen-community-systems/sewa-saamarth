/* eslint-env node */

"use strict";

const express = require("express");
const {h} = require("preact");
const {render} = require("preact-render-to-string");
const fs = require("fs");
const htm = require("htm");
const JSON5 = require("json5");

const html = htm.bind(h);
const {signal, computed} = require("@preact/signals");

const libEnv = {html, signal, computed};

const env = require("../shared/cart.js")(libEnv);

const sewaSheetsScope = require("../node/sewaSheets.js");
const sewa = sewaSheetsScope(env.sewa);

const fluid = require("../shared/fluidLite.js")();

const {parseDocument} = require("../node/doc.js");

const serverConfig = JSON5.parse(fs.readFileSync("serverConfig.json5", "utf8"));

const readJSONSync = function (path) {
    return JSON.parse(fs.readFileSync(path, "utf8"));
};

const replaceNodeText = function (document, selector, text) {
    const node = document.querySelector(selector);
    node.textContent = text;
};

const startServer = async function (googleSheetClient, config) {

    const allDocs = await fluid.asyncTransform(config.tenantConfig, async tenant => {
        if (!config.mock) {
            const allSheets = await sewa.getAllSheets(googleSheetClient, tenant.doc);
            return sewa.convertSheets(allSheets);
        } else {
            return readJSONSync(tenant.convertedMock);
        }
    });

    const app = express();

    app.use("/lib", express.static("docs/lib"));
    app.use("/js", express.static("docs/js"));
    app.use("/img", express.static("docs/img"));
    app.use("/css", express.static("docs/css"));
    app.use("/data", express.static("docs/data"));

    app.get("/", (req, res) => {
        // TODO: Needs to load dynamically
        const title = "SEWA Saamarth Admin Cart Index";
        let response = `<!DOCTYPE html><html>
                <head>
                    <link rel="stylesheet" href="css/index.css" />
                    <title>${title}</title>
                </head><body><h1>${title}</h1>`;
        fluid.each(allDocs, (doc, tenant) => {
            response += `<h2>Tenant: ${tenantConfig[tenant].name}</h2>`;
            response += `<div class="index-table">`;
            fluid.each(doc.users, (rec, userid) => {
                const link = `/${tenant}/cart/${userid}`;
                response += `<div class="index-row"><div>Cart for ${rec.name}</div><div><a href="${link}">${link}</a></div></div>`;
            });
            response += `</div>`;
        });
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
                cart = await sewa.getCartData(googleSheetClient, tenant.doc, userId, today);
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
        submitNode.innerHTML = `sewa.submitCart = "${req.url.replace("cart", "order")}"`;

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
        orderItems.forEach(item => {
            const existingIndex = itemIndex[item.code];
            if (existingIndex) {
                item.columnIndex = existingIndex;
            } else {
                item.columnIndex = nextIndex;
                orderHeaderItems[nextIndex] = item.code;
                ++nextIndex;
            }
        });

        if (nextIndex > maxIndex + 1) {
            const newRow0 = [... orderSheet[0].slice(0, sewa.orderHeaderColumns), ...orderHeaderItems];
            console.log("Found " + (nextIndex - (maxIndex + 1)) + " new items, posting new Orders row 0 ", newRow0);
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
            orderRight[item.columnIndex] = item.orderQuantity + item.orderMeasure + "@" + item.price + "/" + item.priceMeasure;
        });

        const newRow = [...orderLeft, ...orderRight];

        if (cart.cartData.currentOrder) {
            const rowIndex = cart.cartData.currentOrderIndex;
            console.log(`Amending existing order with number ${orderNumber} at row ${rowIndex}`);

            await sewa.updateSheetRow(googleSheetClient, tenant.doc, "Orders", newRow, rowIndex);
        } else {
            // TODO: Add checkbox using https://webapps.stackexchange.com/questions/121502/how-to-add-checkboxes-into-cell-using-google-sheets-api-v4
            console.log(`Adding in new order with number ${orderNumber}`);

            await sewa.appendSheetRow(googleSheetClient, tenant.doc, "Orders", newRow);
        }

        const response = {
            redirect: req.url.replace("order", "orders")
        };
        res.json(response);
    });

    app.get("/:tenant/orders/:userId", async (req, res) => {

        const template = parseDocument("docs/template/orders.html");

        const tenant = tenantConfig[req.params.tenant];
        const userId = req.params.userId;
        const today = sewa.today();

        const {converted, cartData} = await sewa.getCartData(googleSheetClient, tenant.doc, userId, today);

        const userOrders = converted.orders.filter(row => row.userId === userId);

        const todayOrderIndex = userOrders.findIndex(row => row.date === today && row.paid === "FALSE");
        const todayOrder = userOrders[todayOrderIndex];

        if (todayOrderIndex !== -1) {
            userOrders.splice(todayOrderIndex, 1);
        }

        const dumpOrderItems = function (row) {
            const header = `<div class="orders-header">
                <div class="row-img"></div>
                <div class="row-name">Item</div>
                <div class="row-price">Item Price</div>
                <div class="row-quantity">Quantity</div>
                <div class="row-order-price">Price</div>
            </div>`;
            const rows = Object.entries(row).map(([code, qp]) => {
                const {cellQuantity, cellPrice} = sewa.parseOrderCell(qp);
                return dumpOrderItem(code, cellQuantity, cellPrice);
            });
            return [header, ...rows].join("\n");
        };

        const dumpOrderItem = function (code, cellQuantity, cellPrice) {
            const item = converted.prices.items[code];
            const {itemPrice, priceMeasure} = sewa.parseCellPrice(cellPrice);
            const {orderQuantity} = sewa.parseCellQuantity(cellQuantity);

            return `<div class="row-item" data-row="${code}">
                        <img class="row-img" src="../../../img/small/${code}.jpg"/>
                        <div class="row-name">${item.displayName}</div>
                        <div class="row-price">₹${itemPrice} / ${priceMeasure || "kg"}</div>
                        <div class="row-quantity">${cellQuantity}</div>
                        <div class="row-order-price">₹${sewa.computeOrderPrice(orderQuantity, priceMeasure, itemPrice)}</div>
                    </div>`;
        };

        const title = `SEWA Saamarth orders for ${cartData.user.name}`;

        replaceNodeText(template, "title", title);
        replaceNodeText(template, "h1", title);

        let content = "";

        if (todayOrder) {
            if (todayOrder.paid === "TRUE") {
                content += `<div class="order-pay">
                    <div class="order-pay-text">Thank you for today's order. Your payment has been received.</div>
                    <div class="order-feedback"></div>
                </div>`;
            } else {
                content += `<div class="order-pay">
                    <div class="order-pay-text">Thank you for today's order. Please pay the total of <span class="order-total">${todayOrder.value}</span>
                    with SEWA's UPI code:</div><div class="sewa-upi"></div>
                  </div>
                  <div class="order-feedback"></div>`;
            }
            content += `<div class="order-items">${dumpOrderItems(todayOrder.items)}</div>`;

            const feedbackUrl = `/${req.params.tenant}/orderFeedback/${userId}/${todayOrder.orderNumber}`;
            content += `<script>
                sewa.makeOrderFeedbackClient(".order-feedback", {
                    feedbackUrl: "${feedbackUrl}",
                    rating: ${todayOrder.rating},
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
                content += `<div class="order-items">${dumpOrderItems(order.items)}</div>
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

            await sewa.updateSheetRow(googleSheetClient, tenant.doc, "Orders", newRow, orderIndex);

            res.json({message: `Feedback for order ${orderNumber} recorded`});
        }
    });

    const port = config.port;
    app.listen(port);
    console.log(`Running on port ${port}`);
    return app;
};

const start = async function () {
    const client = await sewa.getGoogleSheetClient();
    const app = await startServer(client, serverConfig);
    return {client, app};
};

start().then();
