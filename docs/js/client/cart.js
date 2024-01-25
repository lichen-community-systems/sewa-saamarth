"use strict";

/* global htm, preact, preactSignals, cartScope */

//This worked, but will lead to problems in future binding to signal
//import { html, render } from "https://unpkg.com/htm@3.1.1/preact/standalone.module.js"

//import {render} from "../../lib/preact.js";
//import htm from "../../lib/htm.js";

const html = htm.bind(preact.h);
const {signal, computed} = preactSignals;

const libenv = {html, signal, computed};
const env = cartScope(libenv);

const sewa = env.sewa;

const outside = Date.now();

sewa.renderCart = async function (relativePath) {
    fetch(`${relativePath}/data/cart-c3kptdg1.json`).then(async function (response) {
        console.log("Fetched in " + (Date.now() - outside) + " ms");
        const cart = await response.json();
        console.log("Fetched cart data ", cart);

        const model = sewa.modelisePrices(cart);

        const nodes = html`
            <${sewa.Cart} model=${model} relativePath=${relativePath}/>`;

        const now = Date.now();

        const element = document.getElementById("cart");
        preact.render(nodes, element);
        console.log("Rendered in " + (Date.now() - now) + " ms");
        console.log(element.outerHTML);
    });
};
