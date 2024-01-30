/* eslint-env node */

"use strict";

// TODO - This code is currently locked up in server.js
// We want to write to header and title which is not greatly idiomatic

const ordersScope = function (env) {

    const {html, signal, computed} = env;

    // const $sewa = env.sewa || {};
    const sewa = {};

    return {
        ...env,
        sewa
    };
};

if (typeof(module) !== "undefined") {
    module.exports = ordersScope;
};
