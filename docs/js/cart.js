//This worked, but will lead to problems in future binding to signal
//import { html, render } from "https://unpkg.com/htm@3.1.1/preact/standalone.module.js"

//import {render} from "../../lib/preact.js";
//import htm from "../../lib/htm.js";

const html = htm.bind(preact.h);
const {signal, computed} = preactSignals;

// We've now got preactSignals and preactSignalsCore as globals

const convertMeasure = function (measure) {
    return measure === "1kg" ? "kg" : measure;
}

// Granularity for updating an order quantity in grams
const granularity = 50;

function CartRow(props) {
    const onPlus = function () {
        props.orderQuantity.value += granularity;
    };
    const onMinus = function () {
        props.orderQuantity.value = Math.max(props.orderQuantity.value - granularity, 0);
    };
    const onKeyDown = function (e, handler) {
        console.log("onKeyDown ", e, handler);
        // Enter or Space
        if (e.keyCode == 13 || e.keyCode == 32) {
            handler();
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    };
    const onEntry = function (e) {
        console.log("Got event ", e);
        const value = e.target.value;
        const number = Number(value);
        if (!isNaN(number)) {
            const rounded = Math.round(number / granularity) * granularity;
            props.orderQuantity.value = rounded;
            e.target.value = rounded;
        } else {
            e.target.value = props.orderQuantity.value;
        }
    }


    console.log("CartRow with props ", props);
    return html`<div class="cart-row" data-row="${props.code}">
        <div class="row-item">
            <img class="row-img" src="${props.relativePath}/img/small/${props.code}.jpg"/>
            <div class="row-right">
                <div class="row-name">${props.displayName}</div>
                <div class="row-price">₹${props.price} / ${convertMeasure(props.measure)}</div>
                <div class="row-controls">
                    <div role="button" tabindex="0" 
                         class="minus-button adjust-button ${props.orderQuantity.value ? "" : "disabled"}" 
                         onClick=${onMinus}
                         onKeyDown=${(e)=>onKeyDown(e, onMinus)}>–</div>
                    <input class="quantity" type="text" value=${props.orderQuantity.value || ""} onChange=${onEntry}/> gm
                    <div role="button" tabindex="0" 
                         class="plus-button adjust-button" 
                         onClick=${onPlus}
                         onKeyDown=${(e)=>onKeyDown(e, onPlus)}>+</div>
                </div>
            </div>
        </div>
        <div class="row-order-price">${props.orderPrice.value ? "₹" + props.orderPrice.value : ""}</div>
    </div>`
}

function Cart({model, relativePath}) {
    const {rows, orderPrice} = model;
    console.log("Cart with rows ", rows);
    return html`<div class="cart-root">
        <p>Welcome, ${model.username}!</p>
        <p>SEWA Meghnaben is taking orders today - please check out your cart before 8pm.</p>
        <div class="cart-rows">
      ${rows.map((row, index) => {
          // console.log("Row ", row, " index ", index);
          const togo = html`<${CartRow} ...${row} index=${index} relativePath=${relativePath}/>`;
          return togo;
        }
    )}
            </div>
        <div class="cart-summary">
            <div class="checkout-button ${!model.orderPrice.value ? "disabled" : ""}">Checkout</div>
            <div class="cart-total"><span class="cart-total-label">Total</span>: <span class="cart-total-price">₹${model.orderPrice.value}</span></div>
        </div>
    </div>`
}

const modelisePrices = function (prices, username) {
    const rows = prices.map((row, index) => {
        const orderQuantity = signal(0);
        return {
            ...row,
            orderQuantity,
            // TODO: Read row.measure rather than assuming 1kg
            orderPrice: computed(() => Math.round(orderQuantity.value * row.price / 1000))
        };
    });
    const orderPrice = computed(() => rows.reduce((sum, row) => sum + row.orderPrice.value, 0));
    return {rows, orderPrice, username};
};

const outside = Date.now();

const renderCart = async function (relativePath) {
    fetch(`${relativePath}/data/prices.json`).then(async function (response) {
        console.log("Fetched in " + (Date.now() - outside) + " ms");
        const prices = await response.json();
        console.log("Fetched prices ", prices);

        const model = modelisePrices(prices, "Heli Shukla Karvat");

        const nodes = html`
            <${Cart} model=${model} relativePath=${relativePath}/>`

        const now = Date.now();

        const element = document.getElementById("cart");
        preact.render(nodes, element);
        console.log("Rendered in " + (Date.now() - now) + " ms");
    });
};
