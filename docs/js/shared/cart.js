/* eslint-env node */

"use strict";

const cartScope = function (env) {

    const {html, signal, computed} = env;

    // const $sewa = env.sewa || {};
    const sewa = {};

    // needs to be an IANA supported timezone listed in https://nodatime.org/TimeZones - e.g. "IST" does not work in Firefox
    sewa.timeZone = "Asia/Kolkata";

    sewa.defaultCutoff = "20:00";

    sewa.vendor = "SEWA Lilotri";

    sewa.convertMeasure = function (measure) {
        return measure === "1kg" ? "kg" : measure;
    };

    sewa.today = function () {
        return (new Date()).toLocaleDateString("en-GB", {year: "numeric", month: "2-digit", day: "2-digit", timeZone: sewa.timeZone});
    };

    sewa.timeNow = function () {
        return (new Date()).toLocaleTimeString("en-GB", {hour: "2-digit", minute: "2-digit", timeZone: sewa.timeZone});
    };

    // Adapted from https://stackoverflow.com/a/13898483
    sewa.renderTime = function (timeString) {
        const [hourString, minute] = timeString.split(":");
        const hour = +hourString % 24;
        return (hour % 12 || 12) + ":" + minute + (hour < 12 ? "am" : "pm");
    };

    // TODO: We assume quantity is in grams and that price is in kg
    sewa.computeOrderPrice = function (orderQuantity, priceMeasure, price) {
        return Math.round(orderQuantity * price / 1000);
    };

    sewa.parseCellQuantity = function (cellQuantity) {
        const matched = cellQuantity.match(/(\d+)\s*(\D+)?/);
        return matched ? {
            orderQuantity: matched[1],
            unit: matched[2]
        } : {};
    };

    sewa.parseMinimumOrder = function (minimumOrder) {
        const matched = minimumOrder?.match(/(\d+)\s*(\D+)?/);
        return matched ? {
            minimum: +matched[1],
            unit: matched[2]
        } : {};
    };


    sewa.parseCellPrice = function (cellPrice) {
        const matched = cellPrice.match(/(\d+)\s*\/?\s*(\D+)?/);
        return matched ? {
            itemPrice: matched[1],
            priceMeasure: matched[2]
        } : {};
    };

    sewa.parseOrderCell = function (orderCell) {
        const [cellQuantity, cellPrice] = orderCell.split("@");
        return {cellQuantity, cellPrice};
    };

    // Granularity for updating an order quantity in grams
    const granularity = 50;

    function CartRow(props) {
        const parsedMinimumOrder = sewa.parseMinimumOrder(props.minimumOrder);
        const minimum = parsedMinimumOrder?.minimum || 0;

        const onPlus = function () {
            props.orderQuantity.value += granularity;
            props.orderQuantity.value = Math.max(props.orderQuantity.value, minimum);
        };
        const onMinus = function () {
            props.orderQuantity.value = Math.max(props.orderQuantity.value - granularity, 0);
            if (props.orderQuantity.value < minimum) {
                props.orderQuantity.value = 0;
            }
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
                        <div class="row-price">₹${props.price} / ${sewa.convertMeasure(props.measure)}</div>
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
        // TODO: forced to indent this oddly, and differently in ESLint and WebStorm
        // console.log("Row ", row, " index ", index);

        const togo = html`
            <${CartRow} ...${row} index=${index} relativePath=${relativePath}/>`;
        return togo;
    }
    )}
        </div>`;
    };

    sewa.Cart = function ({model, relativePath}) {
        const {rows, orderPrice} = model;
        const welcome = html`<p>Welcome, ${model.user.name}!</p>`;
        const renderCutoff = sewa.renderTime(model.cutoff);
        const tooLate = sewa.timeNow() > model.cutoff;
        if (rows.length === 0) {
            return html`
                <div class="cart-root">
                    ${welcome}
                    <p>Sorry, ${sewa.vendor} has no items for sale today, please check again later.</p>
                </div>`;
        } else if (tooLate) {
            if (model.existingOrder) {
                return html`<div className="cart-root">
                ${welcome}
                <p>Orders closed today at ${renderCutoff}, your order #${model.existingOrder.orderNumber} placed earlier today will be shipped and can no longer be changed.</p>
                </div>`;
            } else {
                return html`<div className="cart-root">
                ${welcome}
                <p>Sorry, orders closed for today at ${renderCutoff}.</p>
                </div>`;
            }
        }
        return html`
            <div class="cart-root">
                <p>Welcome, ${model.user.name}!</p>
                <p>${sewa.vendor} is taking orders today.</p>
                <p><b>Please check out your cart before ${renderCutoff}.</b></p>
                ${model.existingOrder && html`<p>You are editing your earlier order from today.</p>`}
                <${CartRows} rows="${rows}" relativePath=${relativePath}/>
                <div class="cart-summary">
                    <div class="checkout-button ${!orderPrice.value ? "disabled" : ""}">Checkout</div>
                    <div class="cart-total"><span class="cart-total-label">Total</span>: <span class="cart-total-price">₹${orderPrice.value}</span>
                    </div>
                </div>
            </div>`;
    };

    // Accepts output from sewa.convertCartData
    sewa.modelisePrices = function (cartData) {
        // TODO: Filter these on the server
        const todayPrices = cartData.prices.byDate[cartData.date] || [];
        const cutoff = cartData.prices.cutoffsByDate[cartData.date] || sewa.defaultCutoff;

        const priceRows = cartData.prices.codes.map((code, index) => ({...cartData.prices.items[code], price: todayPrices[index]}))
            .filter(item => !!item.price)
            .sort((a, b) => a.displayName.localeCompare(b.displayName));

        const existing = cartData.currentOrder;

        const fetchInitialQuantity = function (row) {
            if (existing) {
                const existingCell = existing.items[row.code];
                if (existingCell) {
                    const {cellQuantity} = sewa.parseOrderCell(existingCell);
                    return +sewa.parseCellQuantity(cellQuantity).orderQuantity;
                } else {
                    return 0;
                }
            } else {
                return 0;
            }
        };

        const rows = priceRows.map((row) => {
            const initialQuantity = fetchInitialQuantity(row);
            const orderQuantity = signal(initialQuantity);
            return {
                ...row,
                orderQuantity,
                // TODO: Read row.measure rather than assuming 1kg
                orderPrice: computed(() => sewa.computeOrderPrice(orderQuantity.value, row.measure, +row.price)),
                orderMeasure: signal("gm")
            };
        });
        const orderPrice = computed(() => rows.reduce((sum, row) => sum + row.orderPrice.value, 0));
        return {
            rows, orderPrice,
            existingOrder: existing,
            cutoff: cutoff,
            user: cartData.user
        };
    };

    return {
        ...env,
        sewa
    };
};

if (typeof(module) !== "undefined") {
    module.exports = cartScope;
}
