"use strict";

/* global preact, libEnvScope, fluidScope, utilsScope, starScope */

const env = {...libEnvScope(), fluid: fluidScope()};
const sewa = {...utilsScope(), ...starScope(env).sewa};

sewa.makeOrderFeedbackClient = function (selector, options) {
    const starModel = sewa.Stars.modelise({rank: options.rating, maxRank: 5});

    const rating = starModel.selectedStar;
    const feedbackText = env.signal(options.feedbackText || "");
    const feedbackChanged = env.signal(-1); // We get one notification on startup
    const feedbackSubmitted = env.signal(false);
    env.effect( () => {
        feedbackChanged.value = feedbackChanged.peek() + 1;
        // Dummy return to cause a read
        return [feedbackText.value, rating.value];
    });

    const submitFeedback = async function () {
        const payload = {
            rating: rating.value,
            feedbackText: feedbackText.value
        };
        const response = await sewa.postJSON(options.feedbackUrl, payload);
        if (!response.isError) {
            feedbackChanged.value = 0;
            feedbackSubmitted.value = true;
        }
    };

    const Feedback = function () {
        return env.html`
        <div class="order-feedback-inner">
            Please rate how easy you found it to place your order today, and note any problems or comments in the box below:
            <div class="feedback-controls">
                <${sewa.Stars} model=${starModel}/>
                <textarea class="feedback-text" onChange="${e => feedbackText.value = e.target.value}"></textarea>
            </div>
            <div class="feedback-button ${feedbackChanged.value === 0 ? "disabled" : ""}" onClick="${submitFeedback}">Submit Feedback</div>
            <div class="feedback-thanks ${feedbackSubmitted.value ? "" : "hidden"}">Thank you for submitting your feedback!</div>
        </div>`;
    };

    const nodes = env.html`<${Feedback}/>`;

    const element = document.querySelector(selector);
    preact.render(nodes, element);

    return {rating, feedbackText, feedbackChanged};
};