"use strict";

/* global htm, preact, preactSignals, preactHooks */

//This worked, but will lead to problems in future binding to signal
//import { html, render } from "https://unpkg.com/htm@3.1.1/preact/standalone.module.js"

//import {render} from "../../lib/preact.js";
//import htm from "../../lib/htm.js";

// Two unrelated functions - load the library environment on the client, and implement some client-side utilities

// eslint-disable-next-line no-unused-vars
const libEnvScope = function () {
    const html = htm.bind(preact.h);
    const {signal, computed, effect} = preactSignals;
    const {useRef, useEffect} = preactHooks;
    const libenv = {html, signal, computed, effect, useRef, useEffect, preact};
    return libenv;
};

// TODO: Standardise to return {sewa}
// eslint-disable-next-line no-unused-vars
const utilsScope = () => {
    const sewa = {};

    sewa.fetchJSON = async function (path) {
        const response = await fetch(path);
        return await response.json();
    };

    sewa.postJSON = async function (path, payload) {
        const rawResponse = await fetch(path, {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        const response = await rawResponse.json();
        console.log("Got response");
        return response;
    };
    return sewa;
};
