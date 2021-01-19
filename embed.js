(function() {
    if (window.ksRunnerInit) return;

    // This line gets patched up by the cloud
    var pxtConfig = {
    "relprefix": "/pxt-picode-platform/",
    "verprefix": "",
    "workerjs": "/pxt-picode-platform/worker.js",
    "monacoworkerjs": "/pxt-picode-platform/monacoworker.js",
    "gifworkerjs": "/pxt-picode-platform/gifjs/gif.worker.js",
    "serviceworkerjs": "/pxt-picode-platform/serviceworker.js",
    "pxtVersion": "6.3.4",
    "pxtRelId": "",
    "pxtCdnUrl": "/pxt-picode-platform/",
    "commitCdnUrl": "/pxt-picode-platform/",
    "blobCdnUrl": "/pxt-picode-platform/",
    "cdnUrl": "/pxt-picode-platform/",
    "targetVersion": "0.0.0",
    "targetRelId": "",
    "targetUrl": "",
    "targetId": "picode",
    "simUrl": "/pxt-picode-platform/simulator.html",
    "simserviceworkerUrl": "/pxt-picode-platform/simulatorserviceworker.js",
    "simworkerconfigUrl": "/pxt-picode-platform/workerConfig.js",
    "partsUrl": "/pxt-picode-platform/siminstructions.html",
    "runUrl": "/pxt-picode-platform/run.html",
    "docsUrl": "/pxt-picode-platform/docs.html",
    "multiUrl": "/pxt-picode-platform/multi.html",
    "asseteditorUrl": "/pxt-picode-platform/asseteditor.html",
    "isStatic": true
};

    var scripts = [
        "/pxt-picode-platform/highlight.js/highlight.pack.js",
        "/pxt-picode-platform/bluebird.min.js",
        "/pxt-picode-platform/marked/marked.min.js",
    ]

    if (typeof jQuery == "undefined")
        scripts.unshift("/pxt-picode-platform/jquery.js")
    if (typeof jQuery == "undefined" || !jQuery.prototype.sidebar)
        scripts.push("/pxt-picode-platform/semantic.js")
    if (!window.pxtTargetBundle)
        scripts.push("/pxt-picode-platform/target.js");
    scripts.push("/pxt-picode-platform/pxtembed.js");

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
