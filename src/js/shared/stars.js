/* eslint-env node */

"use strict";

const starScope = function (env) {

    const {html, preact, signal, computed, useEffect, useRef, fluid} = env;

    const sewa = {};

    sewa.bindDelegate = function (element, event, selector, callback) {
        element.addEventListener(event, e => {
            if (e.target.matches(selector)) {
                callback(e);
            }
        });
    };

    sewa.testInject = function (element) {
        element.innerHTML = "★";
    };

    sewa.Stars = function ({model}) {
        const {starClasses} = model;
        const renderStars = function () {
            return starClasses.map(clazz => {
                return html`<div class="star-star ${clazz}">★</div>`;
            });
        };

        // Taken from example https://preactjs.com/tutorial/05-refs/
        const element = useRef();

        useEffect(() => {
            sewa.Stars.bindEvents(element.current, model);
        }, []);

        return html`<div class="star-container" ref="${element}">
            ${renderStars()}
        </div>`;
    };

    sewa.Stars.bindEvents = function (element, model) {
        const stars = [...element.querySelectorAll(".star-star")];
        sewa.bindDelegate(element, "mouseover", ".star-star", e => {
            const index = stars.indexOf(e.target);
            model.hoverStar.value = index + 1;
        });
        element.addEventListener("mouseleave", () => {
            model.hoverStar.value = -1;
        });

        sewa.bindDelegate(element, "click", ".star-star", e => {
            const index = stars.indexOf(e.target);
            model.selectedStar.value = index + 1;
        });
    };

    sewa.Stars.makeComponent = function (container, options) {
        const model = sewa.Stars.modelise(options);

        const nodes = html`
        <${sewa.Stars} model=${model}/>`;

        const target = document.querySelector(container);
        preact.render(nodes, target);

        return model;
    };

    // raw model just consists of rank, maxRank
    sewa.Stars.modelise = function (rawModel) {
        const hoverStar = signal(-1);
        const selectedStar = signal(rawModel.rank);
        const effectiveStar = computed(() => hoverStar.value === -1 ? selectedStar.value : hoverStar.value);

        const index = fluid.iota(rawModel.maxRank);

        const starClasses = index.map(i => computed(() => (i < effectiveStar.value ? "star-selected" : "star-unselected")));

        return {hoverStar, selectedStar, effectiveStar, starClasses};
    };

    return {
        sewa
    };
};

if (typeof(module) !== "undefined") {
    module.exports = starScope;
}
