initWebappServiceWorker();
function initWebappServiceWorker() {
    // Empty string for released, otherwise contains the ref or version path
    var ref = "@relprefix@".replace("---", "").replace(/^\//, "");
    // We don't do offline for version paths, only named releases
    var isNamedEndpoint = ref.indexOf("/") === -1;
    // pxtRelId is replaced with the commit hash for this release
    var refCacheName = "makecode;" + ref + ";@pxtRelId@";
    var cdnUrl = "@cdnUrl@";
    var webappUrls = [
        // The current page
        "@targetUrl@/" + ref,
        "@simUrl@",
        // webapp files
        "/pxt-picode-platform/semantic.js",
        "/pxt-picode-platform/main.js",
        "/pxt-picode-platform/pxtapp.js",
        "/pxt-picode-platform/typescript.js",
        "/pxt-picode-platform/marked/marked.min.js",
        "/pxt-picode-platform/highlight.js/highlight.pack.js",
        "/pxt-picode-platform/jquery.js",
        "/pxt-picode-platform/pxtlib.js",
        "/pxt-picode-platform/pxtcompiler.js",
        "/pxt-picode-platform/pxtpy.js",
        "/pxt-picode-platform/pxtblockly.js",
        "/pxt-picode-platform/pxtwinrt.js",
        "/pxt-picode-platform/pxteditor.js",
        "/pxt-picode-platform/pxtsim.js",
        "/pxt-picode-platform/pxtembed.js",
        "/pxt-picode-platform/pxtworker.js",
        "/pxt-picode-platform/pxtweb.js",
        "/pxt-picode-platform/blockly.css",
        "/pxt-picode-platform/semantic.css",
        "/pxt-picode-platform/rtlsemantic.css",
        // blockly
        "/pxt-picode-platform/blockly/media/sprites.png",
        "/pxt-picode-platform/blockly/media/click.mp3",
        "/pxt-picode-platform/blockly/media/disconnect.wav",
        "/pxt-picode-platform/blockly/media/delete.mp3",
        // monaco; keep in sync with webapp/public/index.html
        "/pxt-picode-platform/vs/loader.js",
        "/pxt-picode-platform/vs/base/worker/workerMain.js",
        "/pxt-picode-platform/vs/basic-languages/bat/bat.js",
        "/pxt-picode-platform/vs/basic-languages/cpp/cpp.js",
        "/pxt-picode-platform/vs/basic-languages/python/python.js",
        "/pxt-picode-platform/vs/basic-languages/markdown/markdown.js",
        "/pxt-picode-platform/vs/editor/editor.main.css",
        "/pxt-picode-platform/vs/editor/editor.main.js",
        "/pxt-picode-platform/vs/editor/editor.main.nls.js",
        "/pxt-picode-platform/vs/language/json/jsonMode.js",
        "/pxt-picode-platform/vs/language/json/jsonWorker.js",
        // charts
        "/pxt-picode-platform/smoothie/smoothie_compressed.js",
        "/pxt-picode-platform/images/Bars_black.gif",
        // gifjs
        "/pxt-picode-platform/gifjs/gif.js",
        // ai
        "/pxt-picode-platform/ai.0.js",
        // target
        "/pxt-picode-platform/target.js",
        // These macros should be replaced by the backend
        "",
        "",
        "",
        "@targetUrl@/pxt-picode-platform/monacoworker.js",
        "@targetUrl@/pxt-picode-platform/worker.js"
    ];
    // Replaced by the backend by a list of encoded urls separated by semicolons
    var cachedHexFiles = decodeURLs("");
    var cachedTargetImages = decodeURLs("%2Fpxt-picode-platform%2Fdocs%5Cstatic%5Clogo.svg;%2Fpxt-picode-platform%2Fdocs%5Cstatic%5Clogo.svg;%2Fpxt-picode-platform%2Fdocs%5Cstatic%5Clogo.svg;%2Fpxt-picode-platform%2Fdocs%5Cstatic%5Clogo.svg;%2Fpxt-picode-platform%2Fdocs%5Cstatic%5Corganization.png;%2Fpxt-picode-platform%2Fdocs%5Cstatic%5Corganization.png;%2Fpxt-picode-platform%2Fdocs%5Cstatic%5Chero.png");
    // Duplicate entries in this list will cause an exception so call dedupe
    // just in case
    var allFiles = dedupe(webappUrls.concat(cachedTargetImages)
        .map(function (url) { return url.trim(); })
        .filter(function (url) { return !!url && url.indexOf("@") !== 0; }));
    var didInstall = false;
    self.addEventListener("install", function (ev) {
        if (!isNamedEndpoint) {
            console.log("Skipping service worker install for unnamed endpoint");
            return;
        }
        didInstall = true;
        console.log("Installing service worker...");
        ev.waitUntil(caches.open(refCacheName)
            .then(function (cache) {
            console.log("Opened cache");
            console.log("Caching:\n" + allFiles.join("\n"));
            return cache.addAll(allFiles).then(function () { return cache; });
        })
            .then(function (cache) {
            return cache.addAll(cachedHexFiles).catch(function (e) {
                // Hex files might return a 404 if they haven't hit the backend yet. We
                // need to catch the exception or the service worker will fail to install
                console.log("Failed to cache hexfiles");
            });
        })
            .then(function () { return self.skipWaiting(); }));
    });
    self.addEventListener("activate", function (ev) {
        if (!isNamedEndpoint) {
            console.log("Skipping service worker activate for unnamed endpoint");
            return;
        }
        console.log("Activating service worker...");
        ev.waitUntil(caches.keys()
            .then(function (cacheNames) {
            // Delete all caches that "belong" to this ref except for the current version
            var toDelete = cacheNames.filter(function (c) {
                var cacheRef = getRefFromCacheName(c);
                return cacheRef === null || (cacheRef === ref && c !== refCacheName);
            });
            return Promise.all(toDelete.map(function (name) { return caches.delete(name); }));
        })
            .then(function () {
            if (didInstall) {
                // Only notify clients for the first activation
                didInstall = false;
                return notifyAllClientsAsync();
            }
            return Promise.resolve();
        }));
    });
    self.addEventListener("fetch", function (ev) {
        ev.respondWith(caches.match(ev.request)
            .then(function (response) {
            return response || fetch(ev.request);
        }));
    });
    function dedupe(urls) {
        var res = [];
        for (var _i = 0, urls_1 = urls; _i < urls_1.length; _i++) {
            var url = urls_1[_i];
            if (res.indexOf(url) === -1)
                res.push(url);
        }
        return res;
    }
    function getRefFromCacheName(name) {
        var parts = name.split(";");
        if (parts.length !== 3)
            return null;
        return parts[1];
    }
    function decodeURLs(encodedURLs) {
        // Charcode 64 is '@', we need to calculate it because otherwise the minifier
        // will combine the string concatenation into @cdnUrl@ and get mangled by the backend
        var cdnEscaped = String.fromCharCode(64) + "cdnUrl" + String.fromCharCode(64);
        return dedupe(encodedURLs.split(";")
            .map(function (encoded) { return decodeURIComponent(encoded).replace(cdnEscaped, cdnUrl).trim(); }));
    }
    function notifyAllClientsAsync() {
        var scope = self;
        return scope.clients.claim().then(function () { return scope.clients.matchAll(); }).then(function (clients) {
            clients.forEach(function (client) { return client.postMessage({
                type: "serviceworker",
                state: "activated",
                ref: ref
            }); });
        });
    }
}
