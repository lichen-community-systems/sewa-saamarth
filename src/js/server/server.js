/* eslint-env node */

"use strict";

const express = require("express");
const {h} = require("preact");
const {render} = require("preact-render-to-string");
const fs = require("fs");
const htm = require("htm");

const html = htm.bind(h);
const {signal, computed} = require("@preact/signals");

const libEnv = {html, signal, computed};

const env = require("../shared/cart.js")(libEnv);
const sewa = env.sewa;

const {parseDocument} = require("../node/doc.js");

const app = express();

app.use("/lib", express.static("docs/lib"));
app.use("/js", express.static("docs/js"));
app.use("/img", express.static("docs/img"));
app.use("/css", express.static("docs/css"));
app.use("/data", express.static("docs/data"));

app.get("/", (req, res) => {
    res.send("Hello world\n");
});

app.get("/cart", (req, res) => {
    const template = parseDocument("docs/cart/index.html");

    const cart = JSON.parse(fs.readFileSync("data/cart-c3kptdg1.json", "utf8"));

    const model = sewa.modelisePrices(cart);
    const relativePath = "..";

    const nodes = html`
            <${sewa.Cart} model=${model} relativePath=${relativePath}/>`;

    const rendered = render(nodes);

    const target = template.querySelector("#cart");
    target.innerHTML = rendered;

    const outMarkup = "<!DOCTYPE html>" + template.documentElement.outerHTML;

    res.send(outMarkup);
});

const PORT = 8080;
app.listen(PORT);
console.log(`Running on port ${PORT}`);

