(function() {
    if (window.ksRunnerInit) return;

    // This line gets patched up by the cloud
    var pxtConfig = {
    "relprefix": "/pxt-picode/",
    "verprefix": "",
    "workerjs": "/pxt-picode/worker.js",
    "monacoworkerjs": "/pxt-picode/monacoworker.js",
    "gifworkerjs": "/pxt-picode/gifjs/gif.worker.js",
    "serviceworkerjs": "/pxt-picode/serviceworker.js",
    "pxtVersion": "6.1.18",
    "pxtRelId": "",
    "pxtCdnUrl": "/pxt-picode/",
    "commitCdnUrl": "/pxt-picode/",
    "blobCdnUrl": "/pxt-picode/",
    "cdnUrl": "/pxt-picode/",
    "targetVersion": "0.0.0",
    "targetRelId": "",
    "targetUrl": "",
    "targetId": "picode",
    "simUrl": "/pxt-picode/simulator.html",
    "simserviceworkerUrl": "/pxt-picode/simulatorserviceworker.js",
    "simworkerconfigUrl": "/pxt-picode/workerConfig.js",
    "partsUrl": "/pxt-picode/siminstructions.html",
    "runUrl": "/pxt-picode/run.html",
    "docsUrl": "/pxt-picode/docs.html",
    "multiUrl": "/pxt-picode/multi.html",
    "isStatic": true
};

    var scripts = [
        "/pxt-picode/highlight.js/highlight.pack.js",
        "/pxt-picode/bluebird.min.js",
        "/pxt-picode/marked/marked.min.js",
    ]

    if (typeof jQuery == "undefined")
        scripts.unshift("/pxt-picode/jquery.js")
    if (typeof jQuery == "undefined" || !jQuery.prototype.sidebar)
        scripts.push("/pxt-picode/semantic.js")
    if (!window.pxtTargetBundle)
        scripts.push("/pxt-picode/target.js");
    scripts.push("/pxt-picode/pxtembed.js");

    var pxtCallbacks = []

    window.ksRunnerReady = function(f) {
        if (pxtCallbacks == null) f()
        else pxtCallbacks.push(f)
    }

    window.ksRunnerWhenLoaded = function() {
        pxt.docs.requireHighlightJs = function() { return hljs; }
        pxt.setupWebConfig(pxtConfig || window.pxtWebConfig)
        pxt.runner.initCallbacks = pxtCallbacks
        pxtCallbacks.push(function() {
            pxtCallbacks = null
        })
        pxt.runner.init();
    }

    scripts.forEach(function(src) {
        var script = document.createElement('script');
        script.src = src;
        script.async = false;
        document.head.appendChild(script);
    })

} ())
