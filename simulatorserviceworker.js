initSimulatorServiceWorker();
function initSimulatorServiceWorker() {
    // Empty string for released, otherwise contains the ref or version path
    var ref = "@relprefix@".replace("---", "").replace(/^\//, "");
    // We don't do offline for version paths, only named releases
    var isNamedEndpoint = ref.indexOf("/") === -1;
    // pxtRelId is replaced with the commit hash for this release
    var refCacheName = "makecode-sim;" + ref + ";@pxtRelId@";
    var simUrls = [
        // This is the URL loaded in the simulator iframe (includes ref)
        "@simUrl@",
        "/pxt-picode/bluebird.min.js",
        "/pxt-picode/pxtsim.js",
        "/pxt-picode/sim.js",
    ];
    var allFiles = simUrls.map(function (url) { return url.trim(); })
        .filter(function (url) { return !!url && url.indexOf("@") !== 0; });
    // This function is called by workerConfig.js in the target to configure any
    // extra URLs that need to be cached
    self.setSimulatorWorkerOptions = function (opts) {
        if (opts && Array.isArray(opts.urls)) {
            allFiles.push.apply(allFiles, resolveURLs(opts.urls));
        }
    };
    var didInstall = false;
    self.addEventListener("install", function (ev) {
        if (!isNamedEndpoint) {
            console.log("Skipping service worker install for unnamed endpoint");
            return;
        }
        didInstall = true;
        // Check to see if there are any extra sim URLs to be cached by the target
        try {
            importScripts("@simworkerconfigUrl@");
        }
        catch (e) {
            // This file is optional in the target, so ignore 404 response
            console.log("Failed to load target service worker config");
        }
        console.log("Installing service worker...");
        ev.waitUntil(caches.open(refCacheName)
            .then(function (cache) {
            console.log("Opened cache");
            return cache.addAll(dedupe(allFiles));
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
    function resolveURLs(urls) {
        return dedupe(urls.map(function (url) { return url.trim(); }).filter(function (url) { return !!url; }));
    }
    function getRefFromCacheName(name) {
        var parts = name.split(";");
        if (parts.length !== 3)
            return null;
        return parts[1];
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
