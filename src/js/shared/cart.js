/* eslint-env node */

"use strict";

const cartScope = function (env) {

    const {html, signal, computed} = env;

    const convertMeasure = function (measure) {
        return measure === "1kg" ? "kg" : measure;
    };

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
            if (e.keyCode === 13 || e.keyCode === 32) {
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
        };

        return html`
            <div class="cart-row" data-row="${props.code}">
                <div class="row-item">
                    <img class="row-img" src="${props.relativePath}/img/small/${props.code}.jpg"/>
                    <div class="row-right">
                        <div class="row-name">${props.displayName}</div>
                        <div class="row-price">₹${props.price} / ${convertMeasure(props.measure)}</div>
                        <div class="row-controls">
                            <div role="button" tabindex="0"
                                 class="minus-button adjust-button ${props.orderQuantity.value ? "" : "disabled"}"
                                 onClick=${onMinus}
                                 onKeyDown=${(e) => onKeyDown(e, onMinus)}>–
                            </div>
                            <input class="quantity" type="text" value=${props.orderQuantity.value || ""}
                                   onChange=${onEntry}/> gm
                            <div role="button" tabindex="0"
                                 class="plus-button adjust-button"
                                 onClick=${onPlus}
                                 onKeyDown=${(e) => onKeyDown(e, onPlus)}>+
                            </div>
                        </div>
                    </div>
                </div>
                <div class="row-order-price">${props.orderPrice.value ? "₹" + props.orderPrice.value : ""}</div>
            </div>`;
    }

    const CartRows = function ({rows, relativePath}) {
        return html`<div className="cart-rows">
            ${rows.map((row, index) => {
        // console.log("Row ", row, " index ", index);
        const togo = html`
            <${CartRow} ...${row} index=${index} relativePath=${relativePath}/>`;
        return togo;
    }
    )}
        </div>`;
    };

    function Cart({model, relativePath}) {
        const {rows, orderPrice} = model;
        console.log("Cart with rows ", rows);
        return html`
            <div class="cart-root">
                <p>Welcome, ${model.user.name}!</p>
                <p>SEWA Meghnaben is taking orders today.</p>
                <p><b>Please check out your cart before 8pm.</b></p>
                <${CartRows} rows="${rows}" relativePath=${relativePath}/>

                <div class="cart-summary">
                    <div class="checkout-button ${!orderPrice.value ? "disabled" : ""}">Checkout</div>
                    <div class="cart-total"><span class="cart-total-label">Total</span>: <span class="cart-total-price">₹${orderPrice.value}</span>
                    </div>
                </div>
            </div>`;
    }

    const modelisePrices = function (cart) {
        const priceRows = cart.prices.codes.map(code => cart.prices.items[code])
            .filter(item => !!item.price)
            .sort((a, b) => a.displayName.localeCompare(b.displayName));

        const rows = priceRows.map((row) => {
            const orderQuantity = signal(0);
            return {
                ...row,
                orderQuantity,
                // TODO: Read row.measure rather than assuming 1kg
                orderPrice: computed(() => Math.round(orderQuantity.value * row.price / 1000))
            };
        });
        const orderPrice = computed(() => rows.reduce((sum, row) => sum + row.orderPrice.value, 0));
        return {rows, orderPrice,
            user: cart.user};
    };

    return {
        ...env,
        sewa: {Cart, modelisePrices}
    };
};

if (typeof(module) !== "undefined") {
    module.exports = cartScope;
}
