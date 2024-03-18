"use strict";

/* global preact, libEnvScope, cartScope, utilsScope */

const libenv = libEnvScope();
const env = cartScope(libenv);
const sewa = {...utilsScope(), ...env.sewa};

sewa.submitCartClick = async function (e, url, model) {
    if (!e.target.disabled && url) {
        const items = model.rows.map(row => ({
            code: row.code,
            price: row.price,
            priceMeasure: row.measure,
            orderPrice: row.orderPrice.value,
            orderQuantity: row.orderQuantity.value,
            orderMeasure: row.parsedMeasure.orderMeasure
        })).filter(row => row.orderQuantity > 0);
        const payload = {
            items,
            orderPrice: model.orderPrice.value,
            user: model.user
        };
        const response = await sewa.postJSON(url, payload);
        if (response.redirect) {
            document.location = response.redirect;
        }
    }
};

sewa.renderCart = async function (relativePath, cartPromise) {
    const cart = await cartPromise;

    const model = sewa.modelisePrices(cart);

    const nodes = env.html`
        <${sewa.Cart} model=${model} relativePath=${relativePath}/>`;

    const now = Date.now();

    const element = document.getElementById("cart");
    preact.render(nodes, element);

    const submit = element.querySelector(".checkout-button");
    if (submit) {
        submit.addEventListener("click", e => sewa.submitCartClick(e, sewa.submitCart, model));
    }

    console.log("Rendered in " + (Date.now() - now) + " ms");
};
