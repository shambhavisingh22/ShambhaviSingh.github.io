/* Copied from cookies.js, because this file exists outside the Next.js ecosystem */
function readCookie(name) {
  var nameEQ = name + "=";
  var ca = document.cookie.split(";");
  for (var i = 0; i < ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == " ") c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

function createCookie(name, value, days) {
  if (days) {
    var date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    var expires = "; expires=" + date.toGMTString();
  } else var expires = "";
  document.cookie = name + "=" + value + expires + "; path=/";
}

/**
 * Mirrors feature-flags.js
 */
function getFeatureFlag() {
  const KEY = "featflag";
  let [m, group] = window.location.search.match(/[\?|\&]debug=feature:(\w+)/) || [];
  if (group) {
    createCookie(KEY, group, 365);
  }
  return readCookie(KEY);
}

/* BEGIN EcommStateTracker - This is copied from ecomm.js because this file lives outside the NextJS ecosystem. */
// Utils for Google Ecommerce events
//
// @see https://developers.google.com/analytics/devguides/collection/ga4/reference/events?client_type=gtm
//

/**
 * Since not every Piano event gives us everything
 * we need for Google Enhanced Ecommerce, we're going to collect
 * everything as it appears and push as we need it.
 */
class EcommStateTracker {
  constructor() {
    this._key = "_ecommStateTrackerData";
    this._state = this.loadState();
  }

  loadState() {
    let data = localStorage.getItem(this._key);
    if (!data) {
      return {};
    }
    try {
      return JSON.parse(data);
    } catch (e) {
      return {};
    }
  }

  saveState() {
    localStorage.setItem(this._key, JSON.stringify(this._state));
  }

  setTerm(term_id, term_name) {
    this._state.term_id = term_id;
    this._state.term_name = term_name;
    this.saveState();
  }

  setPrice(value) {
    this._state.value = value;
    this.saveState();
  }

  setCoupon(coupon) {
    this._state.coupon = coupon;
    this.saveState();
  }

  reset() {
    this._state = {};
    this.saveState();
  }

  /**
   * Update the dataLayer with ecommerce data
   * collected over the journey.
   *
   * @param {(
   *  "add_payment_info"|
   *  "add_shipping_info"|
   *  "begin_checkout"|
   *  "purchase"|
   *  "select_item"
   * )} eventName - GTM event to push.
   */
  pushDataLayer(eventName) {
    let data = {
      event: eventName,
      // Google values
      ecommerce: {
        currency: "USD",
        value: this._state.value,
        coupon: this._state.coupon,
        items: [
          {
            item_id: this._state.term_id,
            item_name: this._state.term_name,
            price: this._state.value,
            quantity: 1,
          },
        ],
      },
      // House custom values that we want to use
      // as labels and values on GA events.
      checkout: {
        amount: this._state.value,
        subscriptionType: this._state.term_id,
        subscriptionName: this._state.term_name,
      },
    };
    window.dataLayer.push(data);
  }
}

/* END EcommStateTracker */

/**
 * Detects piano debug mode and syncs it to localStorage
 * - `"log"` - Verbose console logging from Piano TP object
 * - `"prod"` - Verbose logging + force production environment
 * - `"sandbox"` - Verbose logging + force sandbox environment
 * - `false` - Disable Piano debug mode
 * @returns {"prod"|"sandbox"|"log"|false}
 */
function getPianoDebugMode() {
  const key = "piano-debug",
    ls = window.localStorage;
  const debugQuery = location.search.match(/debug=piano(?:-(prod|sandbox|log|reset))*/);

  if (!debugQuery || !debugQuery[0]) {
    return ls.getItem(key) || false;
  }

  const debugFlag = debugQuery[1] || "log";

  if (debugFlag === "reset") {
    ls.removeItem(key);
    return false;
  }

  ls.setItem(key, debugFlag);
  return debugFlag;
}

function getPianoJwt() {
  try {
    const utpCookie = document.cookie.match(/(?:^|;)\s*__utp\s*=\s*([^;]+)/);
    const jwt = JSON.parse(atob(utpCookie[1].split(".")[1]));
    return jwt;
  } catch {}

  return null;
}

function verifyPianoEnvOrPurgeSession(pianoAid) {
  const jwt = getPianoJwt();

  if (jwt && jwt.aud && jwt.aud !== pianoAid) {
    console.warn("Forcing logout due to Piano cookie mismatch: " + jwt.aud + " != " + pianoAid);
    window.tp = window.tp || [];
    window.tp.push([
      "init",
      function () {
        window.tp.pianoId.logout(window.location.reload);
      },
    ]);
  }
}

/**
 * Makes ID iframes
 */
function setIframeDomain() {
  const tp = window.tp || [];

  // Require feature flag
  if (getFeatureFlag() !== "pianosubdomain") return;

  // Only works on our domain
  if (window.location.hostname === "www.scientificamerican.com") {
    tp.push(["setComposerHost", "https://c2.tp.scientificamerican.com"]);
    tp.push(["setPianoIdUrl", "https://id.tp.scientificamerican.com"]);
    tp.push(["setEndpoint", "https://vx.tp.scientificamerican.com"]);
  }
}

function isProdSubdomain() {
  return !!location.hostname.match(/^(?:www|blogs)\./);
}

function isPianoProd() {
  const pianoDebug = getPianoDebugMode();
  const isProdSciAmSubdomain = isProdSubdomain();
  /* 1. check for prod override or match prod subdomains */
  /* 2. check for sandbox override and match prod-ish subdomains */
  return (
    isProdSciAmSubdomain ||
    pianoDebug === "prod" ||
    (pianoDebug !== "sandbox" && location.hostname.match(/^(?:main-www)\./))
  );
}

(function () {
  const isProd = isPianoProd();
  const isProdSciAmSubdomain = isProdSubdomain();
  const subdomain = isProd ? "experience" : "sandbox";
  const pianoAid = isProd ? "FU52w9tupu" : "I2n3TREbsu";
  let a = document.createElement("script");
  a.type = "text/javascript";
  a.async = true;
  a.src = "https://" + subdomain + ".tinypass.com/xbuilder/experience/load?aid=" + pianoAid;
  let b = document.getElementsByTagName("script")[0];
  b.parentNode.insertBefore(a, b);

  if (!isProdSciAmSubdomain) {
    verifyPianoEnvOrPurgeSession(pianoAid);
  }
})();

/* Default pattern to allow Piano's tp.push() commands to work until the tp object becomes available */
window.tp = window.tp || [];

/* Piano consent initialization */
window.pdl = window.pdl || {};
window.pdl.requireConsent = true;

setIframeDomain();

/* Store all OneTrust consent codes, once OneTrust is online. */
let oneTrustConsentCookieArr = [];

/* Convert the 0 or 1 in the cookie to a boolean to pass to datalayer */
let isInstitutionalAccessUser = parseInt(readCookie("_pc_instaccess")) === 1;

/* Determine if content is exempt from Payall.
 * Editors can set a piece of content in Mura to exempt it from the paywall.
 */
const isContentPaywallExempt = Boolean(Mura.whitelistfrommetered);

/* If the page is paywall exempt, set a tag for Piano Composer to check */
if (isContentPaywallExempt) {
  tp.push(["setTags", ["paywall-exempt"]]);
}

/* Custom Variables to send to Piano */
tp.push(["setCustomVariable", "platform", "mura"]);
tp.push(["setCustomVariable", "language", dataLayer[0].content.attributes.language || "en"]);
tp.push(["setCustomVariable", "primaryCategory", dataLayer[0].content.category.subjectType || ""]);
tp.push(["setCustomVariable", "subCategory", dataLayer[0].content.category.subjectSubType1 || ""]);
tp.push(["setCustomVariable", "subtype", dataLayer[0].content.category.contentSubType1 || ""]);
tp.push(["setCustomVariable", "type", dataLayer[0].content.category.contentType || ""]);
tp.push(["setCustomVariable", "contentId", dataLayer[0].content.contentInfo.contentId || ""]);
tp.push([
  "setCustomVariable",
  "collectionId",
  (dataLayer[0].content.contentInfo.collection || [{}])[0].collectionID || "",
]);
tp.push([
  "setCustomVariable",
  "collectionName",
  (dataLayer[0].content.contentInfo.collection || [{}])[0].collectionName || "",
]);
tp.push([
  "setCustomVariable",
  "publishedAtDateTime",
  dataLayer[0].content.contentInfo.publishedAt || "",
]);
tp.push([
  "setCustomVariable",
  "publishedAtDate",
  dataLayer[0].content.contentInfo.publishedAtDate || "",
]);
tp.push([
  "setCustomVariable",
  "publishedAtTime",
  dataLayer[0].content.contentInfo.publishedAtTime || "",
]);
tp.push(["setCustomVariable", "brand", dataLayer[0].content.contentInfo.brand || ""]);
tp.push(["setCustomVariable", "authors", dataLayer[0].content.contentInfo.author.join(",") || []]);
tp.push(["setCustomVariable", "title", dataLayer[0].content.contentInfo.title || ""]);
tp.push(["setCustomVariable", "tags", dataLayer[0].content.attributes.keywords || ""]);
tp.push(["setCustomVariable", "template", dataLayer[0].content.attributes.template || ""]);
tp.push([
  "setCustomVariable",
  "isSyndicated",
  dataLayer[0].content.attributes.copyright.syndicated || false,
]);
tp.push([
  "setCustomVariable",
  "isPartner",
  dataLayer[0].content.category.contentType === "PartnerArticle" || false,
]);
tp.push([
  "setCustomVariable",
  "isSponsored",
  dataLayer[0].content.category.contentType === "CustomMediaArticle" || false,
]);
tp.push([
  "setCustomVariable",
  "isResalable",
  dataLayer[0].content.attributes.copyright.resale || false,
]);
tp.push(["setCustomVariable", "containsMedia", ""]);
tp.push(["setCustomVariable", "articleDoi", (dataLayer[0].content.article || {}).doi || ""]);
tp.push([
  "setCustomVariable",
  "journalIssueName",
  (dataLayer[0].content.article || {}).journalIssueName || "",
]);
tp.push(["setCustomVariable", "updatedAtDateTime", dataLayer[0].content.updatedAt || ""]);
tp.push(["setCustomVariable", "wordCount", dataLayer[0].content.attributes.wordCount || undefined]);

/* Login Setup */
tp.push(["setUsePianoIdUserProvider", true]);

const ecommStateTracker = new EcommStateTracker();

/* Utility function to determine if user has a paid subscription.
 * @returns {Promise} Promise - Eventually resolves with an object that tells us if they have a paid subscription
 */
function userHasAccess() {
  return new Promise(function (resolve, reject) {
    const tp = window.tp;

    if (window._userHasSub !== undefined) {
      resolve({ hasSub: window._userHasSub });
    }

    tp.api.callApi("/access/list", {}, function (resp) {
      /* There are only three products/rIds/terms we have currently.
       * We check the response to see if the user's rid matches any of these products.
       * If so, the user has a paid subscription.
       */
      const subtypes = ["DIGITAL", "DIGPRINT", "UNLMTD"];

      const isPaidUser =
        resp.data.filter(function (perm) {
          return subtypes.indexOf(perm.resource.rid) !== -1;
        }).length > 0;

      window._userHasSub = isPaidUser;
      resolve({ hasSub: isPaidUser });
    });
  });
}

/* https://docs.piano.io/callbacks/#activeevent
 * We want to retrieve the meter value from Piano and send it to datalayer.
 */
tp.push([
  "addHandler",
  "meterActive",
  function (meterData) {
    userHasAccess().then(function (data) {
      /* Don't count paying users */
      if (data.hasSub) {
        return;
      }

      window.dataLayer.push({
        event: "meter_updated",
        user: {
          meterName: meterData.meterName,
          meterType: meterData.type,
          incremented: meterData.incremented,
          meteredPaywallArticleNum: meterData.views,
          maxViews: meterData.maxViews,
          viewsLeft: meterData.viewsLeft,
        },
      });
    });
  },
]);

/* https://docs.piano.io/callbacks/#expiredevent
 * We want to let datalayer know when the paywall overlay is invoked (which should be an expired meter).
 */
tp.push([
  "addHandler",
  "meterExpired",
  function (meterData) {
    userHasAccess().then(function (data) {
      /* Don't count paying users */
      if (data.hasSub) {
        return;
      }

      window.dataLayer.push({
        event: "meter_expired",
        user: {
          meterName: meterData.meterName,
          meterType: meterData.type,
          incremented: meterData.incremented,
          meteredPaywallArticleNum: meterData.views,
          maxViews: meterData.maxViews,
          viewsLeft: meterData.viewsLeft,
        },
      });
    });
  },
]);

/*
 * Reset Segment analytics via a datalayer event
 */
tp.push([
  "addHandler",
  "logout",
  function () {
    window.dataLayer.push({
      event: "logout",
    });
  },
]);

/*
 * Login
 */
tp.push([
  "addHandler",
  "loginSuccess",
  function (data) {
    /* Make sure tp is available inside callback */
    const tp = window.tp;

    window.dataLayer.push({
      event: "login",
      user: {
        isSiteLicenseCustomer: isInstitutionalAccessUser,
        userId: data.params.uid || "",
        loginSource: data.source,
        loginMethod: data.registration ? "registration" : "login",
      },
    });

    /* Reload the page to reduce probability of side effects.  Piano documentation often recommends
     * reloading the page after accessing their Piano ID or Access APIs.
     * Only do this if email_confirmation_required is false (user does not need to confirm email).
     * If the user needs to confirm email, Piano shows another overlay, so we do not want to refresh the page.
     */
    if (!tp.pianoId.getUser().email_confirmation_required) {
      window.location.reload();
    }
  },
]);

/*
 * Registration
 */
tp.push([
  "addHandler",
  "registrationSuccess",
  function (data) {
    window.dataLayer.push({
      event: "sign_up",
      user: {
        userId: data.user.sub || "",
      },
    });
  },
]);

/* https://docs.piano.io/callbacks/#completeevent
 * Push ecommerce data to datalayer. Segment track will fire from GTM via datalayer event.
 */
/* https://docs.piano.io/callbacks/#completeevent
 * Push ecommerce data to datalayer. Segment track will fire from GTM via datalayer event.
 */
tp.push([
  "addHandler",
  "checkoutComplete",
  function (conversion) {
    ecommStateTracker.setCoupon(conversion.promotionId);
    ecommStateTracker.pushDataLayer("purchase");

    // For Segment et al
    window.dataLayer.push({
      event: "checkoutComplete",
      checkout: {
        amount: conversion.chargeAmount /* Number: The amount the user was charged */,
        currencyCode:
          conversion.chargeCurrency /* String: The type of currency used (e.g. "USD") */,
        expirationTime:
          conversion.expires /* Number: Timestamp of the access expiration, UNIX timestamp format */,
        promotionId:
          conversion.promotionId /* String: If a promo code was used, this will be the ID of promotion */,
        resourceId: conversion.rid /* String: The resource ID */,
        startTime: conversion.startAt /* String: When access started, ISO-8861 format */,
        subscriptionType: conversion.termId /* String: The term ID - subscription type */,
        uid: conversion.uid /* String: The user ID */,
      },
    });
    ecommStateTracker.reset(); // Clear state after purchase
  },
]);

/* https://docs.piano.io/callbacks/#closeevent
 * Send datalayer event information when checkout modal/lightbox is closed. Segment track will fire from GTM via datalayer event.
 */
tp.push([
  "addHandler",
  "checkoutClose",
  function (event) {
    /* The event object contains information about the state of closed modal */
    switch (event.state) {
      case "checkoutCompleted":
        /* User completed the purchase and now has access */
        window.dataLayer.push({
          event: "checkoutModalClosed_checkoutCompleted",
        });

        /* Redirect/refresh as recommended by Piano docs */
        /* https://docs.piano.io/faq-article/how-to-redirect-users-back-to-the-article-after-checkout/ */
        var url_params = new URLSearchParams(location.search);

        /* 1. Check for redirect param */
        if (url_params.has("redirect")) {
          window.location.pathname = url_params.get("redirect") || "/";
          break;
        }

        var referrer = document.referrer && new URL(document.referrer);

        /* 2. Check the page referrer */
        if (
          referrer /* check if referrer exists */ &&
          referrer.hostname === location.hostname /* check if referrer is on the same domain */ &&
          !referrer.pathname.includes("/getsciam") /* ignore if referrer is /getsciam */
        ) {
          window.location.href = document.referrer;
        } else {
          /* 3. Redirect to home page */
          window.location.pathname = "/";
        }

        break;
      case "alreadyHasAccess":
        /* User already has access */
        window.dataLayer.push({
          event: "checkoutModalClosed_userAlreadyHasAccess",
        });

        /* Redirect/refresh as recommended by Piano docs */
        window.location.pathname = "/account/";
        break;
      case "voucherRedemptionCompleted":
        /* User redeemed a gift voucher
         * Normally gift redemption happens on a landing page,
         * so logically it makes sense to redirect user to a home page after this
         */
        window.dataLayer.push({
          event: "checkoutModalClosed_voucherRedemptionCompleted",
        });

        /* Redirect/refresh, eliminating params (in case of gifting) */
        window.location.href = "/account/";
        break;
      case "close":
        /* User did not complete the purchase and simply closed the modal */
        window.dataLayer.push({
          event: "checkoutModalClosed_userClosedModal",
        });
    }
  },
]);

/* https://docs.piano.io/callbacks/#selecttermevent
 * Send datalayer event information when the user selects a term within an offer
 */
tp.push([
  "addHandler",
  "checkoutSelectTerm",
  function (termDetails) {
    const tp = window.tp;
    const userObj = tp.pianoId.getUser();

    ecommStateTracker.setTerm(termDetails.termId, termDetails.termName);
    ecommStateTracker.pushDataLayer("select_item");

    window.dataLayer.push({
      event: "checkoutUserSelectTerm",
      user: {
        userId: userObj?.uid || "",
      },
      checkout: {
        subscriptionType: termDetails.termId,
        subscriptionName: termDetails.termName,
        resourceId: termDetails.resourceId,
        resourceName: termDetails.resourceName,
      },
    });
  },
]);

/**
 * https://docs.piano.io/callbacks/#startevent
 *
 * User clicks the select term button, goes through login/registration
 * and into checkout slow.
 */
tp.push([
  "addHandler",
  "startCheckout",
  function (data) {
    const tp = window.tp;
    const userObj = tp.pianoId.getUser();

    window.dataLayer.push({
      event: "checkoutStartCheckout",
      user: {
        userId: userObj?.uid || "",
      },
      checkout: {
        subscriptionType: data.termId,
        offerId: data.offerId,
      },
    });
  },
]);

/* https://docs.piano.io/callbacks/#submitpayment
 * Send datalayer event information when the user submits payment
 */
tp.push([
  "addHandler",
  "submitPayment",
  function (data) {
    const tp = window.tp;
    const userObj = tp.pianoId.getUser();

    ecommStateTracker.setPrice(data.term.chargeAmount);
    ecommStateTracker.pushDataLayer("add_payment_info");

    window.dataLayer.push({
      event: "checkoutSubmitPayment",
      user: {
        userId: userObj?.uid || "",
      },
      checkout: {
        offerId: data.offerId,
        currencyCode: data.term.chargeCurrency,
        description: data.term.description,
        amount: data.term.chargeAmount,
        subscriptionType: data.term.termId,
        subscriptionName: data.term.name,
        totalAmount: data.term.totalAmount,
        sku: data.term.sku,
        resourceId: data.term.resource.rid,
        resourceName: data.term.resource.name,
        resourceDescription: data.term.resource.description,
        termType: data.term.type,
        taxRate: data.term.taxRate,
        taxAmount: data.term.taxAmount,
      },
    });
  },
]);

/* https://docs.piano.io/callbacks/#statechangeevent
 * Send datalayer event information when the user interacts with checkout
 */
tp.push([
  "addHandler",
  "checkoutStateChange",
  function (event) {
    const tp = window.tp;

    const pianoUserObj = tp.pianoId.getUser();
    // Returns true or false: https://docs.piano.io/piano-id-functions/
    const isUserLoggedIn = tp.pianoId.isUserValid();

    /* Fire a datalayer call when a CDS lookup occurs, i.e. external account link submitted */
    if (window.location.pathname === "/account/link/" && event.stateName === "receipt") {
      window.dataLayer.push({
        event: "cds_account_registration",
        user: {
          userId: isUserLoggedIn ? pianoUserObj.uid : "",
        },
      });
    }

    switch (event.stateName) {
      case "state2":
        /* Payment details page.
         * Note: event.term.chargeAmount is not a documented object property in Piano's docs for this callback, but we want to use it for GA ecomm.
         * If the price suddenly stops being reported, check if this property is still valid.
         */
        ecommStateTracker.setPrice(event.term.chargeAmount);
        ecommStateTracker.pushDataLayer("begin_checkout");
        break;
    }
  },
]);

/* Piano initialization */
tp.push([
  "init",
  function () {
    tp.pianoId.init();

    const signinDom = document.getElementById("signin-click");
    const mobileSigninDom = document.getElementById("mobile-signin-click");
    const newsletterLinks = document.querySelectorAll('[href*="newsletter-sign-up"]');

    /* Check if user is signed in */
    function isUserSignedIn() {
      return tp.pianoId.isUserValid();
    }

    /*
     * When user is signed in, change the "Sign In" text into "My Account"
     */
    function changeLinkText_SignInToAccount() {
      const strMyAcct = "My Account";
      const strAcctPageHref = "/account/";
      const strEmailPrefHref = "/account/email-preferences/";

      if (signinDom) {
        signinDom.innerText = strMyAcct;
      }

      if (mobileSigninDom) {
        mobileSigninDom.innerText = strMyAcct;
        mobileSigninDom.href = strAcctPageHref;
      }

      newsletterLinks.forEach(function (link) {
        link.href = strEmailPrefHref;
      });
    }

    /* Send user information on each pageview to datalayer */
    function pushUserInfoToDatalayer() {
      // Returns object: https://docs.piano.io/faq-article/how-to-get-details-for-a-logged-in-user/
      const pianoUserObj = tp.pianoId.getUser();
      // Returns true or false: https://docs.piano.io/piano-id-functions/
      const isUserLoggedIn = tp.pianoId.isUserValid();
      const isProd = isPianoProd();
      const pianoAid = isProd ? "FU52w9tupu" : "I2n3TREbsu";

      /* Push non-PII user-related info into dataLayer */
      let dataLayerObj = {
        event: "userInfo",
        user: {
          /* String: Alphanumeric ID of the user assigned by system */
          userId: isUserLoggedIn ? pianoUserObj.uid : "",
          /* String: Name of subscription */
          subscriptionName: undefined,
          /* String: Type of subscription */
          subscriptionType: undefined,
          /* Boolean: Is the user logged in? */
          isLoggedIn: isUserLoggedIn,
          isRegistered: false,
          isSubscriber: false,
          /* Boolean: Is the user part of an institution and has access based on IP address? */
          isSiteLicenseCustomer: isInstitutionalAccessUser,
        },
      };

      if (isUserLoggedIn) {
        /* If user is logged in, they have to be registered. */
        dataLayerObj.user.isRegistered = true;

        /* If user is logged in, make a call to get user's subscription access and pass to datalayer */
        tp.api.callApi("/access/list", { aid: pianoAid }, function (data) {
          /* If registered user has no subscription, resource.rid will be undefined, causing optional chaining evaluation to return undefined */
          if (data?.data[0]?.resource?.rid !== undefined) {
            dataLayerObj.user.isSubscriber = true;
          }

          dataLayerObj.user.subscriptionType = data?.data[0]?.resource?.rid;
          dataLayerObj.user.subscriptionName = data?.data[0]?.resource?.name;
          window.dataLayer.push(dataLayerObj);
        });
      } else {
        /* If user is not logged in, push available known info to datalayer */
        window.dataLayer.push(dataLayerObj);
      }
    }

    /* Initialize Piano login */
    function handleSignInClick(event) {
      tp.pianoId.show({
        screen: "login",
      });

      /* Stop the href # from happening */
      event.preventDefault();
    }

    /* Check if the user is signed in on initialization */
    /* If the user is signed in, change the link to go the account page */
    if (isUserSignedIn()) {
      changeLinkText_SignInToAccount();
    } else {
      /* If the user is not signed in, set up the Piano login and event listeners. */
      signinDom.addEventListener("click", handleSignInClick);
      mobileSigninDom.addEventListener("click", handleSignInClick);
    }

    pushUserInfoToDatalayer();

    /* Push work to find OneTrust consent codes into the consentQueue.  That way, once OneTrust dependencies
     * come online, this work to find OneTrust consent codes will work.
     */
    window.consentQueue.push(function () {
      /* Find OneTrust consents */
      oneTrustConsentCookieArr = OptanonActiveGroups.split(",");

      /* OneTrust encodes its consent selects in the format C0002.
       * Use these to determine if Piano should use full or restricted processing
       */
      const oneTrustPerformance = oneTrustConsentCookieArr.indexOf("C0002") !== -1;
      const oneTrustFunctional = oneTrustConsentCookieArr.indexOf("C0003") !== -1;
      const hasConsent = oneTrustPerformance && oneTrustFunctional;

      /* If Piano consent not given yet, then pass consent codes derived from OneTrust */
      if (!tp.consent.get()) {
        /* No opt-out for authentication */
        tp.consent.set("ID", { mode: "opt-in" });

        /* Other Piano products will be based on consent level */
        tp.consent.set("COMPOSER", { mode: hasConsent ? "opt-in" : "essential" });
        tp.consent.set("PA", { mode: hasConsent ? "opt-in" : "essential" });
        tp.consent.set("VX", { mode: hasConsent ? "opt-in" : "essential" });
      }

      tp.experience.init();
    });
  },
]);

tp.push(["setDebug", !!getPianoDebugMode()]);
