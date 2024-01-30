"use strict";

/* global fluidScope, starScope, libEnvScope, preact */

// eslint-disable-next-line no-redeclare
const fluid = fluidScope();

const libenv = {...libEnvScope(), fluid};

const env = {...libenv, ...starScope(libenv)};

// eslint-disable-next-line no-unused-vars
const sewa = env.sewa;

const {html} = env;

sewa.makeOrderFeedbackClient = function (selector, options) {
    const starModel = sewa.Stars.modelise({rank: options.rating, maxRank: 5});

    const rating = starModel.selectedStar;
    const feedbackText = env.signal(options.feedbackText || "");
    const feedbackChanged = env.signal(0);
    env.effect( () => {
        if (feedbackText.value || rating.value) {
            feedbackChanged.value = feedbackChanged.peek() + 1;
        }
    });

    const nodes = html`
        <div class="order-feedback-inner">
            Please rate how easy you found it to place your order today, and note any problems or comments in the box below:
            <${sewa.Stars} model=${starModel}/>
                <textarea class="feedback-text" onChange="${e => feedbackText.value = e.target.value}"></textarea>
        </div>`;


    const element = document.querySelector(selector);
    preact.render(nodes, element);

    return {rating, feedbackText, feedbackChanged};
};
