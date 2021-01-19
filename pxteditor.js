var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var pxt;
(function (pxt) {
    var editor;
    (function (editor_1) {
        var SimState;
        (function (SimState) {
            SimState[SimState["Stopped"] = 0] = "Stopped";
            // waiting to be started
            SimState[SimState["Pending"] = 1] = "Pending";
            SimState[SimState["Starting"] = 2] = "Starting";
            SimState[SimState["Running"] = 3] = "Running";
        })(SimState = editor_1.SimState || (editor_1.SimState = {}));
        function isBlocks(f) {
            return pxt.U.endsWith(f.name, ".blocks");
        }
        editor_1.isBlocks = isBlocks;
        var ErrorListState;
        (function (ErrorListState) {
            ErrorListState["HeaderOnly"] = "errorListHeader";
            ErrorListState["Expanded"] = "errorListExpanded";
        })(ErrorListState = editor_1.ErrorListState || (editor_1.ErrorListState = {}));
        var FilterState;
        (function (FilterState) {
            FilterState[FilterState["Hidden"] = 0] = "Hidden";
            FilterState[FilterState["Visible"] = 1] = "Visible";
            FilterState[FilterState["Disabled"] = 2] = "Disabled";
        })(FilterState = editor_1.FilterState || (editor_1.FilterState = {}));
        editor_1.initExtensionsAsync = function (opts) { return Promise.resolve({}); };
        editor_1.initFieldExtensionsAsync = function (opts) { return Promise.resolve({}); };
        editor_1.HELP_IMAGE_URI = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjYiIGhlaWdodD0iMjYiIHZpZXdCb3g9IjAgMCAyNiAyNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTMiIGN5PSIxMyIgcj0iMTMiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0xNy45NTIgOS4xODQwMkMxNy45NTIgMTAuMjU2IDE3LjgxNiAxMS4wNzIgMTcuNTQ0IDExLjYzMkMxNy4yODggMTIuMTkyIDE2Ljc1MiAxMi43OTIgMTUuOTM2IDEzLjQzMkMxNS4xMiAxNC4wNzIgMTQuNTc2IDE0LjU4NCAxNC4zMDQgMTQuOTY4QzE0LjA0OCAxNS4zMzYgMTMuOTIgMTUuNzM2IDEzLjkyIDE2LjE2OFYxNi45NkgxMS44MDhDMTEuNDI0IDE2LjQ2NCAxMS4yMzIgMTUuODQgMTEuMjMyIDE1LjA4OEMxMS4yMzIgMTQuNjg4IDExLjM4NCAxNC4yODggMTEuNjg4IDEzLjg4OEMxMS45OTIgMTMuNDg4IDEyLjUzNiAxMi45NjggMTMuMzIgMTIuMzI4QzE0LjEwNCAxMS42NzIgMTQuNjI0IDExLjE2OCAxNC44OCAxMC44MTZDMTUuMTM2IDEwLjQ0OCAxNS4yNjQgOS45NjgwMiAxNS4yNjQgOS4zNzYwMkMxNS4yNjQgOC4yMDgwMiAxNC40MTYgNy42MjQwMiAxMi43MiA3LjYyNDAyQzExLjc2IDcuNjI0MDIgMTAuNzUyIDcuNzM2MDIgOS42OTYgNy45NjAwMkw5LjE0NCA4LjA4MDAyTDkgNi4wODgwMkMxMC40ODggNS41NjAwMiAxMS44NCA1LjI5NjAyIDEzLjA1NiA1LjI5NjAyQzE0LjczNiA1LjI5NjAyIDE1Ljk2OCA1LjYwODAyIDE2Ljc1MiA2LjIzMjAyQzE3LjU1MiA2Ljg0MDAyIDE3Ljk1MiA3LjgyNDAyIDE3Ljk1MiA5LjE4NDAyWk0xMS40IDIyVjE4LjY0SDE0LjE4NFYyMkgxMS40WiIgZmlsbD0iIzU5NUU3NCIvPgo8L3N2Zz4K';
        var _initEditorExtensionsPromise;
        function initEditorExtensionsAsync() {
            if (!_initEditorExtensionsPromise) {
                _initEditorExtensionsPromise = Promise.resolve();
                if (pxt.appTarget && pxt.appTarget.appTheme && pxt.appTarget.appTheme.extendFieldEditors) {
                    var opts_1 = {};
                    _initEditorExtensionsPromise = _initEditorExtensionsPromise
                        .then(function () { return pxt.BrowserUtils.loadBlocklyAsync(); })
                        .then(function () { return pxt.BrowserUtils.loadScriptAsync("fieldeditors.js"); })
                        .then(function () { return pxt.editor.initFieldExtensionsAsync(opts_1); })
                        .then(function (res) {
                        if (res.fieldEditors)
                            res.fieldEditors.forEach(function (fi) {
                                pxt.blocks.registerFieldEditor(fi.selector, fi.editor, fi.validator);
                            });
                    });
                }
            }
            return _initEditorExtensionsPromise;
        }
        editor_1.initEditorExtensionsAsync = initEditorExtensionsAsync;
    })(editor = pxt.editor || (pxt.editor = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var editor;
    (function (editor_2) {
        var pendingRequests = {};
        /**
         * Binds incoming window messages to the project view.
         * Requires the "allowParentController" flag in the pxtarget.json/appTheme object.
         *
         * When the project view receives a request (EditorMessageRequest),
         * it starts the command and returns the result upon completion.
         * The response (EditorMessageResponse) contains the request id and result.
         * Some commands may be async, use the ``id`` field to correlate to the original request.
         */
        function bindEditorMessages(getEditorAsync) {
            var allowEditorMessages = (pxt.appTarget.appTheme.allowParentController || pxt.shell.isControllerMode())
                && pxt.BrowserUtils.isIFrame();
            var allowExtensionMessages = pxt.appTarget.appTheme.allowPackageExtensions;
            var allowSimTelemetry = pxt.appTarget.appTheme.allowSimulatorTelemetry;
            if (!allowEditorMessages && !allowExtensionMessages && !allowSimTelemetry)
                return;
            window.addEventListener("message", function (msg) {
                var data = msg.data;
                if (!data || !/^pxt(host|editor|pkgext|sim)$/.test(data.type))
                    return false;
                if (data.type === "pxtpkgext" && allowExtensionMessages) {
                    // Messages sent to the editor iframe from a child iframe containing an extension
                    getEditorAsync().then(function (projectView) {
                        projectView.handleExtensionRequest(data);
                    });
                }
                else if (data.type === "pxtsim" && allowSimTelemetry) {
                    var event_1 = data;
                    if (event_1.action === "event") {
                        if (event_1.category || event_1.message) {
                            pxt.reportError(event_1.category, event_1.message, event_1.data);
                        }
                        else {
                            pxt.tickEvent(event_1.tick, event_1.data);
                        }
                    }
                }
                else if (allowEditorMessages) {
                    // Messages sent to the editor from the parent frame
                    var p = Promise.resolve();
                    var resp_1 = undefined;
                    if (data.type == "pxthost") { // response from the host
                        var req_1 = pendingRequests[data.id];
                        if (!req_1) {
                            pxt.debug("pxthost: unknown request " + data.id);
                        }
                        else {
                            p = p.then(function () { return req_1.resolve(data); });
                        }
                    }
                    else if (data.type == "pxteditor") { // request from the editor
                        p = p.then(function () {
                            return getEditorAsync().then(function (projectView) {
                                var req = data;
                                pxt.debug("pxteditor: " + req.action);
                                switch (req.action.toLowerCase()) {
                                    case "switchjavascript": return Promise.resolve().then(function () { return projectView.openJavaScript(); });
                                    case "switchpython": return Promise.resolve().then(function () { return projectView.openPython(); });
                                    case "switchblocks": return Promise.resolve().then(function () { return projectView.openBlocks(); });
                                    case "startsimulator": return Promise.resolve().then(function () { return projectView.startSimulator(); });
                                    case "restartsimulator": return Promise.resolve().then(function () { return projectView.restartSimulator(); });
                                    case "hidesimulator": return Promise.resolve().then(function () { return projectView.collapseSimulator(); });
                                    case "showsimulator": return Promise.resolve().then(function () { return projectView.expandSimulator(); });
                                    case "closeflyout": return Promise.resolve().then(function () { return projectView.closeFlyout(); });
                                    case "redo": return Promise.resolve()
                                        .then(function () {
                                        var editor = projectView.editor;
                                        if (editor && editor.hasRedo())
                                            editor.redo();
                                    });
                                    case "undo": return Promise.resolve()
                                        .then(function () {
                                        var editor = projectView.editor;
                                        if (editor && editor.hasUndo())
                                            editor.undo();
                                    });
                                    case "setscale": {
                                        var zoommsg_1 = data;
                                        return Promise.resolve()
                                            .then(function () { return projectView.editor.setScale(zoommsg_1.scale); });
                                    }
                                    case "stopsimulator": {
                                        var stop_1 = data;
                                        return Promise.resolve()
                                            .then(function () { return projectView.stopSimulator(stop_1.unload); });
                                    }
                                    case "newproject": {
                                        var create_1 = data;
                                        return Promise.resolve()
                                            .then(function () { return projectView.newProject(create_1.options); });
                                    }
                                    case "importproject": {
                                        var load_1 = data;
                                        return Promise.resolve()
                                            .then(function () { return projectView.importProjectAsync(load_1.project, {
                                            filters: load_1.filters,
                                            searchBar: load_1.searchBar
                                        }); });
                                    }
                                    case "importtutorial": {
                                        var load_2 = data;
                                        return Promise.resolve()
                                            .then(function () { return projectView.importTutorialAsync(load_2.markdown); });
                                    }
                                    case "proxytosim": {
                                        var simmsg_1 = data;
                                        return Promise.resolve()
                                            .then(function () { return projectView.proxySimulatorMessage(simmsg_1.content); });
                                    }
                                    case "renderblocks": {
                                        var rendermsg_1 = data;
                                        return Promise.resolve()
                                            .then(function () { return projectView.renderBlocksAsync(rendermsg_1); })
                                            .then(function (r) {
                                            return r.xml.then(function (svg) {
                                                resp_1 = svg.xml;
                                            });
                                        });
                                    }
                                    case "renderpython": {
                                        var rendermsg_2 = data;
                                        return Promise.resolve()
                                            .then(function () { return projectView.renderPythonAsync(rendermsg_2); })
                                            .then(function (r) {
                                            resp_1 = r.python;
                                        });
                                    }
                                    case "toggletrace": {
                                        var togglemsg_1 = data;
                                        return Promise.resolve()
                                            .then(function () { return projectView.toggleTrace(togglemsg_1.intervalSpeed); });
                                    }
                                    case "settracestate": {
                                        var trcmsg_1 = data;
                                        return Promise.resolve()
                                            .then(function () { return projectView.setTrace(trcmsg_1.enabled, trcmsg_1.intervalSpeed); });
                                    }
                                    case "setsimulatorfullscreen": {
                                        var fsmsg_1 = data;
                                        return Promise.resolve()
                                            .then(function () { return projectView.setSimulatorFullScreen(fsmsg_1.enabled); });
                                    }
                                    case "togglehighcontrast": {
                                        return Promise.resolve()
                                            .then(function () { return projectView.toggleHighContrast(); });
                                    }
                                    case "togglegreenscreen": {
                                        return Promise.resolve()
                                            .then(function () { return projectView.toggleGreenScreen(); });
                                    }
                                    case "print": {
                                        return Promise.resolve()
                                            .then(function () { return projectView.printCode(); });
                                    }
                                    case "pair": {
                                        return projectView.pairAsync();
                                    }
                                    case "info": {
                                        return Promise.resolve()
                                            .then(function () {
                                            resp_1 = {
                                                versions: pxt.appTarget.versions,
                                                locale: ts.pxtc.Util.userLanguage(),
                                                availableLocales: pxt.appTarget.appTheme.availableLocales
                                            };
                                        });
                                    }
                                }
                                return Promise.resolve();
                            });
                        });
                    }
                    p.done(function () { return sendResponse(data, resp_1, true, undefined); }, function (err) { return sendResponse(data, resp_1, false, err); });
                }
                return true;
            }, false);
        }
        editor_2.bindEditorMessages = bindEditorMessages;
        /**
         * Sends analytics messages upstream to container if any
         */
        function enableControllerAnalytics() {
            if (!pxt.appTarget.appTheme.allowParentController || !pxt.BrowserUtils.isIFrame())
                return;
            var te = pxt.tickEvent;
            pxt.tickEvent = function (id, data) {
                if (te)
                    te(id, data);
                postHostMessageAsync({
                    type: 'pxthost',
                    action: 'event',
                    tick: id,
                    response: false,
                    data: data
                });
            };
            var rexp = pxt.reportException;
            pxt.reportException = function (err, data) {
                if (rexp)
                    rexp(err, data);
                try {
                    postHostMessageAsync({
                        type: 'pxthost',
                        action: 'event',
                        tick: 'error',
                        message: err.message,
                        response: false,
                        data: data
                    });
                }
                catch (e) {
                }
            };
            var re = pxt.reportError;
            pxt.reportError = function (cat, msg, data) {
                if (re)
                    re(cat, msg, data);
                postHostMessageAsync({
                    type: 'pxthost',
                    action: 'event',
                    tick: 'error',
                    category: cat,
                    message: msg,
                    data: data
                });
            };
        }
        editor_2.enableControllerAnalytics = enableControllerAnalytics;
        function sendResponse(request, resp, success, error) {
            if (request.response) {
                window.parent.postMessage({
                    type: request.type,
                    id: request.id,
                    resp: resp,
                    success: success,
                    error: error
                }, "*");
            }
        }
        /**
         * Posts a message from the editor to the host
         */
        function postHostMessageAsync(msg) {
            return new Promise(function (resolve, reject) {
                var env = pxt.Util.clone(msg);
                env.id = ts.pxtc.Util.guidGen();
                if (msg.response)
                    pendingRequests[env.id] = { resolve: resolve, reject: reject };
                window.parent.postMessage(env, "*");
                if (!msg.response)
                    resolve(undefined);
            });
        }
        editor_2.postHostMessageAsync = postHostMessageAsync;
    })(editor = pxt.editor || (pxt.editor = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var editor;
    (function (editor) {
        var experiments;
        (function (experiments_1) {
            function key(experiment) {
                return "experiments-" + experiment.id;
            }
            function syncTheme() {
                var theme = pxt.savedAppTheme();
                var r = {};
                var experiments = all();
                experiments.forEach(function (experiment) {
                    var enabled = isEnabled(experiment);
                    theme[experiment.id] = !!enabled;
                    if (enabled)
                        r[experiment.id] = enabled ? 1 : 0;
                });
                if (experiments.length && Object.keys(r).length) {
                    pxt.tickEvent("experiments.loaded", r);
                    pxt.reloadAppTargetVariant();
                }
            }
            experiments_1.syncTheme = syncTheme;
            function all() {
                var ids = pxt.appTarget.appTheme.experiments;
                if (!ids)
                    return [];
                return [
                    {
                        id: "print",
                        name: lf("Print Code"),
                        description: lf("Print the code from the current project"),
                        feedbackUrl: "https://github.com/microsoft/pxt/issues/4740"
                    },
                    {
                        id: "greenScreen",
                        name: lf("Green screen"),
                        description: lf("Display a webcam video stream or a green background behind the code."),
                        feedbackUrl: "https://github.com/microsoft/pxt/issues/4738"
                    },
                    {
                        id: "allowPackageExtensions",
                        name: lf("Editor Extensions"),
                        description: lf("Allow Extensions to add buttons in the editor."),
                        feedbackUrl: "https://github.com/microsoft/pxt/issues/4741"
                    },
                    {
                        id: "instructions",
                        name: lf("Wiring Instructions"),
                        description: lf("Generate step-by-step assembly instructions for breadboard wiring."),
                        feedbackUrl: "https://github.com/microsoft/pxt/issues/4739"
                    },
                    {
                        id: "debugger",
                        name: lf("Debugger"),
                        description: lf("Step through code and inspect variables in the debugger"),
                        feedbackUrl: "https://github.com/microsoft/pxt/issues/4729"
                    },
                    {
                        id: "bluetoothUartConsole",
                        name: "Bluetooth Console",
                        description: lf("Receives UART message through Web Bluetooth"),
                        feedbackUrl: "https://github.com/microsoft/pxt/issues/4796"
                    },
                    {
                        id: "bluetoothPartialFlashing",
                        name: "Bluetooth Download",
                        description: lf("Download code via Web Bluetooth"),
                        feedbackUrl: "https://github.com/microsoft/pxt/issues/4807"
                    },
                    {
                        id: "simScreenshot",
                        name: lf("Simulator Screenshots"),
                        description: lf("Download screenshots of the simulator"),
                        feedbackUrl: "https://github.com/microsoft/pxt/issues/5232"
                    },
                    {
                        id: "python",
                        name: lf("Static Python"),
                        description: lf("Use Static Python to code your device"),
                        feedbackUrl: "https://github.com/microsoft/pxt/issues/5390"
                    },
                    {
                        id: "simGif",
                        name: lf("Simulator Gifs"),
                        description: lf("Download gifs of the simulator"),
                        feedbackUrl: "https://github.com/microsoft/pxt/issues/5297"
                    },
                    {
                        id: "qrCode",
                        name: lf("Shared QR Code"),
                        description: lf("Generate a QR Code form the shared project url"),
                        feedbackUrl: "https://github.com/microsoft/pxt/issues/5456"
                    },
                    {
                        id: "importExtensionFiles",
                        name: lf("Import Extension Files"),
                        description: lf("Import Extensions from compiled project files")
                    },
                    {
                        id: "debugExtensionCode",
                        name: lf("Debug Extension Code"),
                        description: lf("Use the JavaScript debugger to debug extension code")
                    },
                    {
                        id: "snippetBuilder",
                        name: lf("Snippet Builder"),
                        description: lf("Try out the new snippet dialogs.")
                    },
                    {
                        id: "experimentalHw",
                        name: lf("Experimental Hardware"),
                        description: lf("Enable support for hardware marked 'experimental' in the hardware seletion dialog")
                    },
                    {
                        id: "checkForHwVariantWebUSB",
                        name: lf("Detect Hardware with WebUSB"),
                        description: lf("When compiling, use WebUSB to detect hardware configuration.")
                    },
                    {
                        id: "githubEditor",
                        name: lf("GitHub editor"),
                        description: lf("Review, commit and push to GitHub."),
                        feedbackUrl: "https://github.com/microsoft/pxt/issues/6419"
                    },
                    {
                        id: "githubCompiledJs",
                        name: lf("GitHub Pages JavaScript"),
                        description: lf("Commit compiled javascript when creating a release")
                    },
                    {
                        id: "blocksCollapsing",
                        name: lf("Collapse blocks"),
                        description: lf("Collapse and expand functions or event blocks")
                    },
                    {
                        id: "tutorialBlocksDiff",
                        name: lf("Tutorial Block Diffs"),
                        description: lf("Automatially render blocks diff in tutorials")
                    },
                    {
                        id: "openProjectNewTab",
                        name: lf("Open in New Tab"),
                        description: lf("Open an editor in a new tab.")
                    },
                    {
                        id: "openProjectNewDependentTab",
                        name: lf("Open in New Connected Tab"),
                        description: lf("Open connected editors in different browser tabs.")
                    },
                    {
                        id: "accessibleBlocks",
                        name: lf("Accessible Blocks"),
                        description: lf("Use the WASD keys to move and modify blocks."),
                        feedbackUrl: "https://github.com/microsoft/pxt/issues/6850"
                    },
                    {
                        id: "errorList",
                        name: lf("Error List"),
                        description: lf("Show an error list panel for JavaScript and Python.")
                    }
                ].filter(function (experiment) { return ids.indexOf(experiment.id) > -1; });
            }
            experiments_1.all = all;
            function clear() {
                all().forEach(function (experiment) { return pxt.storage.removeLocal(key(experiment)); });
                syncTheme();
            }
            experiments_1.clear = clear;
            function someEnabled() {
                return all().some(function (experiment) { return isEnabled(experiment); });
            }
            experiments_1.someEnabled = someEnabled;
            function isEnabled(experiment) {
                return !!pxt.storage.getLocal(key(experiment));
            }
            experiments_1.isEnabled = isEnabled;
            function toggle(experiment) {
                setState(experiment, !isEnabled(experiment));
            }
            experiments_1.toggle = toggle;
            function state() {
                var r = {};
                all().forEach(function (experiment) { return r[experiment.id] = isEnabled(experiment); });
                return JSON.stringify(r);
            }
            experiments_1.state = state;
            function setState(experiment, enabled) {
                if (enabled == isEnabled(experiment))
                    return; // no changes
                if (enabled)
                    pxt.storage.setLocal(key(experiment), "1");
                else
                    pxt.storage.removeLocal(key(experiment));
                // sync theme
                syncTheme();
            }
            experiments_1.setState = setState;
        })(experiments = editor.experiments || (editor.experiments = {}));
    })(editor = pxt.editor || (pxt.editor = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var editor;
    (function (editor) {
        var PermissionResponses;
        (function (PermissionResponses) {
            PermissionResponses[PermissionResponses["Granted"] = 0] = "Granted";
            PermissionResponses[PermissionResponses["Denied"] = 1] = "Denied";
            PermissionResponses[PermissionResponses["NotAvailable"] = 2] = "NotAvailable";
        })(PermissionResponses = editor.PermissionResponses || (editor.PermissionResponses = {}));
    })(editor = pxt.editor || (pxt.editor = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var storage;
    (function (storage) {
        var MemoryStorage = /** @class */ (function () {
            function MemoryStorage() {
                this.items = {};
            }
            MemoryStorage.prototype.removeItem = function (key) {
                delete this.items[key];
            };
            MemoryStorage.prototype.getItem = function (key) {
                return this.items[key];
            };
            MemoryStorage.prototype.setItem = function (key, value) {
                this.items[key] = value;
            };
            MemoryStorage.prototype.clear = function () {
                this.items = {};
            };
            return MemoryStorage;
        }());
        var LocalStorage = /** @class */ (function () {
            function LocalStorage(storageId) {
                this.storageId = storageId;
            }
            LocalStorage.prototype.targetKey = function (key) {
                return this.storageId + '/' + key;
            };
            LocalStorage.prototype.removeItem = function (key) {
                window.localStorage.removeItem(this.targetKey(key));
            };
            LocalStorage.prototype.getItem = function (key) {
                return window.localStorage[this.targetKey(key)];
            };
            LocalStorage.prototype.setItem = function (key, value) {
                window.localStorage[this.targetKey(key)] = value;
            };
            LocalStorage.prototype.clear = function () {
                var prefix = this.targetKey('');
                var keys = [];
                for (var i = 0; i < window.localStorage.length; ++i) {
                    var key = window.localStorage.key(i);
                    if (key.indexOf(prefix) == 0)
                        keys.push(key);
                }
                keys.forEach(function (key) { return window.localStorage.removeItem(key); });
            };
            return LocalStorage;
        }());
        function storageId() {
            if (pxt.appTarget)
                return pxt.appTarget.id;
            var cfg = window.pxtConfig;
            if (cfg)
                return cfg.targetId;
            var bndl = window.pxtTargetBundle;
            if (bndl)
                return bndl.id;
            return '';
        }
        storage.storageId = storageId;
        var impl;
        function init() {
            if (impl)
                return;
            // test if local storage is supported
            var sid = storageId();
            var supported = false;
            // no local storage in sandbox mode
            if (!pxt.shell.isSandboxMode()) {
                try {
                    window.localStorage[sid] = '1';
                    var v = window.localStorage[sid];
                    supported = true;
                }
                catch (e) { }
            }
            if (!supported) {
                impl = new MemoryStorage();
                pxt.debug('storage: in memory');
            }
            else {
                impl = new LocalStorage(sid);
                pxt.debug("storage: local under " + sid);
            }
        }
        function setLocal(key, value) {
            init();
            impl.setItem(key, value);
        }
        storage.setLocal = setLocal;
        function getLocal(key) {
            init();
            return impl.getItem(key);
        }
        storage.getLocal = getLocal;
        function removeLocal(key) {
            init();
            impl.removeItem(key);
        }
        storage.removeLocal = removeLocal;
        function clearLocal() {
            init();
            impl.clear();
        }
        storage.clearLocal = clearLocal;
    })(storage = pxt.storage || (pxt.storage = {}));
})(pxt || (pxt = {}));
/// <reference path="../localtypings/monaco.d.ts" />
/// <reference path="../built/pxtlib.d.ts"/>
/// <reference path="../built/pxtblocks.d.ts"/>
var pxt;
(function (pxt) {
    var vs;
    (function (vs) {
        function syncModels(mainPkg, libs, currFile, readOnly) {
            if (readOnly)
                return;
            var extraLibs = monaco.languages.typescript.typescriptDefaults.getExtraLibs();
            var modelMap = {};
            mainPkg.sortedDeps().forEach(function (pkg) {
                pkg.getFiles().forEach(function (f) {
                    var fp = pkg.id + "/" + f;
                    var proto = "pkg:" + fp;
                    if (/\.(ts)$/.test(f) && fp != currFile) {
                        if (!monaco.languages.typescript.typescriptDefaults.getExtraLibs()[fp]) {
                            // inserting a space creates syntax errors in Python
                            var content = pkg.readFile(f) || "\n";
                            libs[fp] = monaco.languages.typescript.typescriptDefaults.addExtraLib(content, fp);
                        }
                        modelMap[fp] = "1";
                    }
                });
            });
            // dispose of any extra libraries, the typescript worker will be killed as a result of this
            Object.keys(extraLibs)
                .filter(function (lib) { return /\.(ts)$/.test(lib) && !modelMap[lib]; })
                .forEach(function (lib) {
                libs[lib].dispose();
            });
        }
        vs.syncModels = syncModels;
        function initMonacoAsync(element) {
            return new Promise(function (resolve, reject) {
                if (typeof (window.monaco) === 'object') {
                    // monaco is already loaded
                    resolve(createEditor(element));
                    return;
                }
                var monacoPaths = window.MonacoPaths;
                var onGotAmdLoader = function () {
                    var req = window.require;
                    req.config({
                        paths: monacoPaths,
                        ignoreDuplicateModules: ["vs/basic-languages/typescript/typescript.contribution", "vs/basic-languages/javascript/javascript.contribution"]
                    });
                    // Mock out the JavaScript and TypeScript modules because we use our own language service
                    var def = window.define;
                    def("vs/basic-languages/typescript/typescript.contribution", ["require", "exports"], function () { return function () { }; });
                    def("vs/basic-languages/javascript/javascript.contribution", ["require", "exports"], function () { return function () { }; });
                    def("vs/language/typescript/tsMode", ["require", "exports"], function () {
                        return {
                            setupTypeScript: function () { },
                            getTypeScriptWorker: function () { },
                            setupJavaScript: function () { },
                            getJavaScriptWorker: function () { },
                        };
                    });
                    // Load monaco
                    req(['vs/editor/editor.main'], function () {
                        setupMonaco();
                        resolve(createEditor(element));
                    });
                };
                // Load AMD loader if necessary
                if (!window.require) {
                    var loaderScript = document.createElement('script');
                    loaderScript.type = 'text/javascript';
                    loaderScript.src = monacoPaths['vs/loader'];
                    loaderScript.addEventListener('load', onGotAmdLoader);
                    document.body.appendChild(loaderScript);
                }
                else {
                    onGotAmdLoader();
                }
            });
        }
        vs.initMonacoAsync = initMonacoAsync;
        function setupMonaco() {
            initAsmMonarchLanguage();
            initTypeScriptLanguageDefinition();
        }
        function createEditor(element) {
            var inverted = pxt.appTarget.appTheme.invertedMonaco;
            var hasFieldEditors = !!(pxt.appTarget.appTheme.monacoFieldEditors && pxt.appTarget.appTheme.monacoFieldEditors.length);
            var isAndroid = pxt.BrowserUtils.isAndroid();
            var editor = monaco.editor.create(element, {
                model: null,
                ariaLabel: pxt.Util.lf("JavaScript editor"),
                fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', 'monospace'",
                scrollBeyondLastLine: true,
                language: "typescript",
                mouseWheelZoom: false,
                wordBasedSuggestions: true,
                lineNumbersMinChars: 3,
                formatOnPaste: true,
                folding: hasFieldEditors,
                glyphMargin: hasFieldEditors || pxt.appTarget.appTheme.debugger,
                minimap: {
                    enabled: false
                },
                fixedOverflowWidgets: true,
                autoIndent: "full",
                useTabStops: true,
                dragAndDrop: true,
                matchBrackets: "always",
                occurrencesHighlight: false,
                quickSuggestionsDelay: 200,
                theme: inverted ? 'vs-dark' : 'vs',
                renderIndentGuides: true,
                accessibilityHelpUrl: "",
                // disable completions on android
                quickSuggestions: {
                    "other": !isAndroid,
                    "comments": !isAndroid,
                    "strings": !isAndroid
                },
                acceptSuggestionOnCommitCharacter: !isAndroid,
                acceptSuggestionOnEnter: !isAndroid ? "on" : "off",
                accessibilitySupport: !isAndroid ? "on" : "off"
            });
            editor.layout();
            return editor;
        }
        vs.createEditor = createEditor;
        function initAsmMonarchLanguage() {
            monaco.languages.register({ id: 'asm', extensions: ['.asm'] });
            monaco.languages.setMonarchTokensProvider('asm', {
                // Set defaultToken to invalid to see what you do not tokenize yet
                // defaultToken: 'invalid',
                tokenPostfix: '',
                //Extracted from http://infocenter.arm.com/help/topic/com.arm.doc.qrc0006e/QRC0006_UAL16.pdf
                //Should be a superset of the instructions emitted
                keywords: [
                    'movs', 'mov', 'adds', 'add', 'adcs', 'adr', 'subs', 'sbcs', 'sub', 'rsbs',
                    'muls', 'cmp', 'cmn', 'ands', 'eors', 'orrs', 'bics', 'mvns', 'tst', 'lsls',
                    'lsrs', 'asrs', 'rors', 'ldr', 'ldrh', 'ldrb', 'ldrsh', 'ldrsb', 'ldm',
                    'str', 'strh', 'strb', 'stm', 'push', 'pop', 'cbz', 'cbnz', 'b', 'bl', 'bx', 'blx',
                    'sxth', 'sxtb', 'uxth', 'uxtb', 'rev', 'rev16', 'revsh', 'svc', 'cpsid', 'cpsie',
                    'setend', 'bkpt', 'nop', 'sev', 'wfe', 'wfi', 'yield',
                    'beq', 'bne', 'bcs', 'bhs', 'bcc', 'blo', 'bmi', 'bpl', 'bvs', 'bvc', 'bhi', 'bls',
                    'bge', 'blt', 'bgt', 'ble', 'bal',
                    //Registers
                    'r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15',
                    'pc', 'sp', 'lr'
                ],
                typeKeywords: [
                    '.startaddr', '.hex', '.short', '.space', '.section', '.string', '.byte'
                ],
                operators: [],
                // Not all of these are valid in ARM Assembly
                symbols: /[:\*]+/,
                // C# style strings
                escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
                // The main tokenizer for our languages
                tokenizer: {
                    root: [
                        // identifiers and keywords
                        [/(\.)?[a-z_$\.][\w$]*/, {
                                cases: {
                                    '@typeKeywords': 'keyword',
                                    '@keywords': 'keyword',
                                    '@default': 'identifier'
                                }
                            }],
                        // whitespace
                        { include: '@whitespace' },
                        // delimiters and operators
                        [/[{}()\[\]]/, '@brackets'],
                        [/[<>](?!@symbols)/, '@brackets'],
                        [/@symbols/, {
                                cases: {
                                    '@operators': 'operator',
                                    '@default': ''
                                }
                            }],
                        // @ annotations.
                        [/@\s*[a-zA-Z_\$][\w\$]*/, { token: 'annotation' }],
                        // numbers
                        //[/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
                        [/(#|(0[xX]))?[0-9a-fA-F]+/, 'number'],
                        // delimiter: after number because of .\d floats
                        [/[;,.]/, 'delimiter'],
                        // strings
                        [/"([^"\\]|\\.)*$/, 'string.invalid'],
                        [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],
                        // characters
                        [/'[^\\']'/, 'string'],
                        [/(')(@escapes)(')/, ['string', 'string.escape', 'string']],
                        [/'/, 'string.invalid']
                    ],
                    comment: [],
                    string: [
                        [/[^\\"]+/, 'string'],
                        [/@escapes/, 'string.escape'],
                        [/\\./, 'string.escape.invalid'],
                        [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }]
                    ],
                    whitespace: [
                        [/[ \t\r\n]+/, 'white'],
                        [/\/\*/, 'comment', '@comment'],
                        [/;.*$/, 'comment'],
                    ],
                }
            });
        }
        function initTypeScriptLanguageDefinition() {
            // Taken from https://github.com/microsoft/monaco-languages/blob/master/src/typescript/typescript.ts
            monaco.languages.register({
                id: "typescript",
                extensions: [".ts", ".tsx"],
                aliases: ["TypeScript", "ts", "typescript"],
                mimetypes: ["text/typescript"],
            });
            monaco.languages.setLanguageConfiguration("typescript", {
                wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
                comments: {
                    lineComment: '//',
                    blockComment: ['/*', '*/']
                },
                brackets: [
                    ['{', '}'],
                    ['[', ']'],
                    ['(', ')']
                ],
                onEnterRules: [
                    {
                        // e.g. /** | */
                        beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
                        afterText: /^\s*\*\/$/,
                        action: { indentAction: monaco.languages.IndentAction.IndentOutdent, appendText: ' * ' }
                    },
                    {
                        // e.g. /** ...|
                        beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
                        action: { indentAction: monaco.languages.IndentAction.None, appendText: ' * ' }
                    },
                    {
                        // e.g.  * ...|
                        beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
                        action: { indentAction: monaco.languages.IndentAction.None, appendText: '* ' }
                    },
                    {
                        // e.g.  */|
                        beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
                        action: { indentAction: monaco.languages.IndentAction.None, removeText: 1 }
                    }
                ],
                autoClosingPairs: [
                    { open: '{', close: '}' },
                    { open: '[', close: ']' },
                    { open: '(', close: ')' },
                    { open: '"', close: '"', notIn: ['string'] },
                    { open: '\'', close: '\'', notIn: ['string', 'comment'] },
                    { open: '`', close: '`', notIn: ['string', 'comment'] },
                    { open: "/**", close: " */", notIn: ["string"] }
                ],
                folding: {
                    markers: {
                        start: new RegExp("^\\s*//\\s*#?region\\b"),
                        end: new RegExp("^\\s*//\\s*#?endregion\\b")
                    }
                }
            });
            monaco.languages.setMonarchTokensProvider("typescript", {
                // Set defaultToken to invalid to see what you do not tokenize yet
                defaultToken: 'invalid',
                tokenPostfix: '.ts',
                keywords: [
                    'abstract', 'as', 'break', 'case', 'catch', 'class', 'continue', 'const',
                    'constructor', 'debugger', 'declare', 'default', 'delete', 'do', 'else',
                    'enum', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function',
                    'get', 'if', 'implements', 'import', 'in', 'infer', 'instanceof', 'interface',
                    'is', 'keyof', 'let', 'module', 'namespace', 'never', 'new', 'null', 'package',
                    'private', 'protected', 'public', 'readonly', 'require', 'global', 'return',
                    'set', 'static', 'super', 'switch', 'symbol', 'this', 'throw', 'true', 'try',
                    'type', 'typeof', 'unique', 'var', 'void', 'while', 'with', 'yield', 'async',
                    'await', 'of'
                ],
                typeKeywords: [
                    'any', 'boolean', 'number', 'object', 'string', 'undefined'
                ],
                operators: [
                    '<=', '>=', '==', '!=', '===', '!==', '=>', '+', '-', '**',
                    '*', '/', '%', '++', '--', '<<', '</', '>>', '>>>', '&',
                    '|', '^', '!', '~', '&&', '||', '??', '?', ':', '=', '+=', '-=',
                    '*=', '**=', '/=', '%=', '<<=', '>>=', '>>>=', '&=', '|=',
                    '^=', '@',
                ],
                // we include these common regular expressions
                symbols: /[=><!~?:&|+\-*\/\^%]+/,
                escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
                digits: /\d+(_+\d+)*/,
                octaldigits: /[0-7]+(_+[0-7]+)*/,
                binarydigits: /[0-1]+(_+[0-1]+)*/,
                hexdigits: /[[0-9a-fA-F]+(_+[0-9a-fA-F]+)*/,
                regexpctl: /[(){}\[\]\$\^|\-*+?\.]/,
                regexpesc: /\\(?:[bBdDfnrstvwWn0\\\/]|@regexpctl|c[A-Z]|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4})/,
                // The main tokenizer for our languages
                tokenizer: {
                    root: [
                        [/[{}]/, 'delimiter.bracket'],
                        { include: 'common' }
                    ],
                    common: [
                        // identifiers and keywords
                        [/[a-z_$][\w$]*/, {
                                cases: {
                                    '@typeKeywords': 'keyword',
                                    '@keywords': 'keyword',
                                    '@default': 'identifier'
                                }
                            }],
                        [/[A-Z][\w\$]*/, 'type.identifier'],
                        // [/[A-Z][\w\$]*/, 'identifier'],
                        // whitespace
                        { include: '@whitespace' },
                        // regular expression: ensure it is terminated before beginning (otherwise it is an opeator)
                        [/\/(?=([^\\\/]|\\.)+\/([gimsuy]*)(\s*)(\.|;|,|\)|\]|\}|$))/, { token: 'regexp', bracket: '@open', next: '@regexp' }],
                        // delimiters and operators
                        [/[()\[\]]/, '@brackets'],
                        [/[<>](?!@symbols)/, '@brackets'],
                        [/!(?=([^=]|$))/, 'delimiter'],
                        [/@symbols/, {
                                cases: {
                                    '@operators': 'delimiter',
                                    '@default': ''
                                }
                            }],
                        // numbers
                        [/(@digits)[eE]([\-+]?(@digits))?/, 'number.float'],
                        [/(@digits)\.(@digits)([eE][\-+]?(@digits))?/, 'number.float'],
                        [/0[xX](@hexdigits)n?/, 'number.hex'],
                        [/0[oO]?(@octaldigits)n?/, 'number.octal'],
                        [/0[bB](@binarydigits)n?/, 'number.binary'],
                        [/(@digits)n?/, 'number'],
                        // delimiter: after number because of .\d floats
                        [/[;,.]/, 'delimiter'],
                        // strings
                        [/"([^"\\]|\\.)*$/, 'string.invalid'],
                        [/'([^'\\]|\\.)*$/, 'string.invalid'],
                        [/"/, 'string', '@string_double'],
                        [/'/, 'string', '@string_single'],
                        [/`/, 'string', '@string_backtick'],
                    ],
                    whitespace: [
                        [/[ \t\r\n]+/, ''],
                        [/\/\*\*(?!\/)/, 'comment.doc', '@jsdoc'],
                        [/\/\*/, 'comment', '@comment'],
                        [/\/\/.*$/, 'comment'],
                    ],
                    comment: [
                        [/[^\/*]+/, 'comment'],
                        [/\*\//, 'comment', '@pop'],
                        [/[\/*]/, 'comment']
                    ],
                    jsdoc: [
                        [/[^\/*]+/, 'comment.doc'],
                        [/\*\//, 'comment.doc', '@pop'],
                        [/[\/*]/, 'comment.doc']
                    ],
                    // We match regular expression quite precisely
                    regexp: [
                        [/(\{)(\d+(?:,\d*)?)(\})/, ['regexp.escape.control', 'regexp.escape.control', 'regexp.escape.control']],
                        [/(\[)(\^?)(?=(?:[^\]\\\/]|\\.)+)/, ['regexp.escape.control', { token: 'regexp.escape.control', next: '@regexrange' }]],
                        [/(\()(\?:|\?=|\?!)/, ['regexp.escape.control', 'regexp.escape.control']],
                        [/[()]/, 'regexp.escape.control'],
                        [/@regexpctl/, 'regexp.escape.control'],
                        [/[^\\\/]/, 'regexp'],
                        [/@regexpesc/, 'regexp.escape'],
                        [/\\\./, 'regexp.invalid'],
                        [/(\/)([gimsuy]*)/, [{ token: 'regexp', bracket: '@close', next: '@pop' }, 'keyword.other']],
                    ],
                    regexrange: [
                        [/-/, 'regexp.escape.control'],
                        [/\^/, 'regexp.invalid'],
                        [/@regexpesc/, 'regexp.escape'],
                        [/[^\]]/, 'regexp'],
                        [/\]/, { token: 'regexp.escape.control', next: '@pop', bracket: '@close' }]
                    ],
                    string_double: [
                        [/[^\\"]+/, 'string'],
                        [/@escapes/, 'string.escape'],
                        [/\\./, 'string.escape.invalid'],
                        [/"/, 'string', '@pop']
                    ],
                    string_single: [
                        [/[^\\']+/, 'string'],
                        [/@escapes/, 'string.escape'],
                        [/\\./, 'string.escape.invalid'],
                        [/'/, 'string', '@pop']
                    ],
                    string_backtick: [
                        [/\$\{/, { token: 'delimiter.bracket', next: '@bracketCounting' }],
                        [/[^\\`$]+/, 'string'],
                        [/@escapes/, 'string.escape'],
                        [/\\./, 'string.escape.invalid'],
                        [/`/, 'string', '@pop']
                    ],
                    bracketCounting: [
                        [/\{/, 'delimiter.bracket', '@bracketCounting'],
                        [/\}/, 'delimiter.bracket', '@pop'],
                        { include: 'common' }
                    ],
                },
            });
        }
    })(vs = pxt.vs || (pxt.vs = {}));
})(pxt || (pxt = {}));
var pxt;
(function (pxt) {
    var shell;
    (function (shell) {
        var EditorLayoutType;
        (function (EditorLayoutType) {
            EditorLayoutType[EditorLayoutType["IDE"] = 0] = "IDE";
            EditorLayoutType[EditorLayoutType["Sandbox"] = 1] = "Sandbox";
            EditorLayoutType[EditorLayoutType["Widget"] = 2] = "Widget";
            EditorLayoutType[EditorLayoutType["Controller"] = 3] = "Controller";
        })(EditorLayoutType = shell.EditorLayoutType || (shell.EditorLayoutType = {}));
        var layoutType;
        var editorReadonly = false;
        function init() {
            if (layoutType !== undefined)
                return;
            var sandbox = /sandbox=1|#sandbox|#sandboxproject/i.test(window.location.href)
                // in iframe
                || pxt.BrowserUtils.isIFrame();
            var nosandbox = /nosandbox=1/i.test(window.location.href);
            var controller = /controller=1/i.test(window.location.href) && pxt.BrowserUtils.isIFrame();
            var readonly = /readonly=1/i.test(window.location.href);
            var layout = /editorlayout=(widget|sandbox|ide)/i.exec(window.location.href);
            layoutType = EditorLayoutType.IDE;
            if (nosandbox)
                layoutType = EditorLayoutType.Widget;
            else if (controller)
                layoutType = EditorLayoutType.Controller;
            else if (sandbox)
                layoutType = EditorLayoutType.Sandbox;
            if (controller && readonly)
                editorReadonly = true;
            if (layout) {
                switch (layout[1].toLowerCase()) {
                    case "widget":
                        layoutType = EditorLayoutType.Widget;
                        break;
                    case "sandbox":
                        layoutType = EditorLayoutType.Sandbox;
                        break;
                    case "ide":
                        layoutType = EditorLayoutType.IDE;
                        break;
                }
            }
            pxt.debug("shell: layout type " + EditorLayoutType[layoutType] + ", readonly " + isReadOnly());
        }
        function layoutTypeClass() {
            init();
            return pxt.shell.EditorLayoutType[layoutType].toLowerCase();
        }
        shell.layoutTypeClass = layoutTypeClass;
        function isSandboxMode() {
            init();
            return layoutType == EditorLayoutType.Sandbox;
        }
        shell.isSandboxMode = isSandboxMode;
        function isReadOnly() {
            return (isSandboxMode()
                && !/[?&]edit=1/i.test(window.location.href)) ||
                (isControllerMode() && editorReadonly);
        }
        shell.isReadOnly = isReadOnly;
        function isControllerMode() {
            init();
            return layoutType == EditorLayoutType.Controller;
        }
        shell.isControllerMode = isControllerMode;
    })(shell = pxt.shell || (pxt.shell = {}));
})(pxt || (pxt = {}));
/// <reference path="../built/pxtlib.d.ts"/>
var pxt;
(function (pxt) {
    var workspace;
    (function (workspace) {
        function freshHeader(name, modTime) {
            var header = {
                target: pxt.appTarget.id,
                targetVersion: pxt.appTarget.versions.target,
                name: name,
                meta: {},
                editor: pxt.JAVASCRIPT_PROJECT_NAME,
                pubId: "",
                pubCurrent: false,
                _rev: null,
                id: pxt.U.guidGen(),
                recentUse: modTime,
                modificationTime: modTime,
                blobId: null,
                blobVersion: null,
                blobCurrent: false,
                isDeleted: false,
            };
            return header;
        }
        workspace.freshHeader = freshHeader;
    })(workspace = pxt.workspace || (pxt.workspace = {}));
})(pxt || (pxt = {}));
/// <reference path="../../localtypings/monaco.d.ts" />
var pxt;
(function (pxt) {
    var editor;
    (function (editor) {
        var definitions = {};
        function registerMonacoFieldEditor(name, definition) {
            definitions[name] = definition;
        }
        editor.registerMonacoFieldEditor = registerMonacoFieldEditor;
        function getMonacoFieldEditor(name) {
            return definitions[name];
        }
        editor.getMonacoFieldEditor = getMonacoFieldEditor;
    })(editor = pxt.editor || (pxt.editor = {}));
})(pxt || (pxt = {}));
/// <reference path="./monacoFieldEditor.ts" />
var pxt;
(function (pxt) {
    var editor;
    (function (editor) {
        var fieldEditorId = "image-editor";
        var MonacoReactFieldEditor = /** @class */ (function () {
            function MonacoReactFieldEditor() {
            }
            MonacoReactFieldEditor.prototype.getId = function () {
                return fieldEditorId;
            };
            MonacoReactFieldEditor.prototype.showEditorAsync = function (fileType, editrange, host) {
                var _this = this;
                this.fileType = fileType;
                this.editrange = editrange;
                this.host = host;
                return this.initAsync().then(function () {
                    var value = _this.textToValue(host.getText(editrange));
                    if (!value) {
                        return Promise.resolve(null);
                    }
                    _this.fv = pxt.react.getFieldEditorView(_this.getFieldEditorId(), value, _this.getOptions());
                    _this.fv.onHide(function () {
                        _this.onClosed();
                    });
                    _this.fv.show();
                    return new Promise(function (resolve, reject) {
                        _this.resolver = resolve;
                        _this.rejecter = reject;
                    });
                });
            };
            MonacoReactFieldEditor.prototype.onClosed = function () {
                if (this.resolver) {
                    this.resolver({
                        range: this.editrange,
                        replacement: this.resultToText(this.fv.getResult())
                    });
                    this.editrange = undefined;
                    this.resolver = undefined;
                    this.rejecter = undefined;
                }
            };
            MonacoReactFieldEditor.prototype.dispose = function () {
                this.onClosed();
            };
            MonacoReactFieldEditor.prototype.initAsync = function () {
                return Promise.resolve();
            };
            MonacoReactFieldEditor.prototype.textToValue = function (text) {
                return null;
            };
            MonacoReactFieldEditor.prototype.resultToText = function (result) {
                return result + "";
            };
            MonacoReactFieldEditor.prototype.getFieldEditorId = function () {
                return "";
            };
            MonacoReactFieldEditor.prototype.getOptions = function () {
                return null;
            };
            return MonacoReactFieldEditor;
        }());
        editor.MonacoReactFieldEditor = MonacoReactFieldEditor;
    })(editor = pxt.editor || (pxt.editor = {}));
})(pxt || (pxt = {}));
/// <reference path="./monacoFieldEditor.ts" />
/// <reference path="./field_react.ts" />
var pxt;
(function (pxt) {
    var editor;
    (function (editor) {
        var fieldEditorId = "image-editor";
        var MonacoSpriteEditor = /** @class */ (function (_super) {
            __extends(MonacoSpriteEditor, _super);
            function MonacoSpriteEditor() {
                return _super !== null && _super.apply(this, arguments) || this;
            }
            MonacoSpriteEditor.prototype.textToValue = function (text) {
                this.isPython = text.indexOf("`") === -1;
                return pxt.sprite.imageLiteralToBitmap(text);
            };
            MonacoSpriteEditor.prototype.resultToText = function (result) {
                return pxt.sprite.bitmapToImageLiteral(result, this.isPython ? "python" : "typescript");
            };
            MonacoSpriteEditor.prototype.getFieldEditorId = function () {
                return "image-editor";
            };
            MonacoSpriteEditor.prototype.getOptions = function () {
                return {
                    initWidth: 16,
                    initHeight: 16,
                    blocksInfo: this.host.blocksInfo(),
                    showTiles: true
                };
            };
            return MonacoSpriteEditor;
        }(editor.MonacoReactFieldEditor));
        editor.MonacoSpriteEditor = MonacoSpriteEditor;
        editor.spriteEditorDefinition = {
            id: fieldEditorId,
            foldMatches: true,
            glyphCssClass: "sprite-editor-glyph sprite-focus-hover",
            heightInPixels: 510,
            matcher: {
                // match both JS and python
                searchString: "img\\s*(?:`|\\(\\s*\"\"\")[ a-fA-F0-9\\.\\n]*\\s*(?:`|\"\"\"\\s*\\))",
                isRegex: true,
                matchCase: true,
                matchWholeWord: false
            },
            proto: MonacoSpriteEditor
        };
        editor.registerMonacoFieldEditor(fieldEditorId, editor.spriteEditorDefinition);
    })(editor = pxt.editor || (pxt.editor = {}));
})(pxt || (pxt = {}));
/// <reference path="./monacoFieldEditor.ts" />
/// <reference path="./field_react.ts" />
var pxt;
(function (pxt) {
    var editor;
    (function (editor) {
        var fieldEditorId = "tilemap-editor";
        var MonacoTilemapEditor = /** @class */ (function (_super) {
            __extends(MonacoTilemapEditor, _super);
            function MonacoTilemapEditor() {
                return _super !== null && _super.apply(this, arguments) || this;
            }
            MonacoTilemapEditor.prototype.textToValue = function (text) {
                var tm = this.readTilemap(text);
                var allTiles = pxt.react.getTilemapProject().getProjectTiles(tm.tileset.tileWidth, true);
                var _loop_1 = function (tile) {
                    if (!tm.tileset.tiles.some(function (t) { return t.id === tile.id; })) {
                        tm.tileset.tiles.push(tile);
                    }
                };
                for (var _i = 0, _a = allTiles.tiles; _i < _a.length; _i++) {
                    var tile = _a[_i];
                    _loop_1(tile);
                }
                var _loop_2 = function (tile) {
                    tile.weight = allTiles.tiles.findIndex(function (t) { return t.id === tile.id; });
                };
                for (var _b = 0, _c = tm.tileset.tiles; _b < _c.length; _b++) {
                    var tile = _c[_b];
                    _loop_2(tile);
                }
                return tm;
            };
            MonacoTilemapEditor.prototype.readTilemap = function (text) {
                var project = pxt.react.getTilemapProject();
                if (/^\s*tiles\s*\./.test(text)) {
                    this.isTilemapLiteral = false;
                    if (text) {
                        try {
                            var data = pxt.sprite.decodeTilemap(text, "typescript", project);
                            return data;
                        }
                        catch (e) {
                            // If the user is still typing, they might try to open the editor on an incomplete tilemap
                        }
                        return null;
                    }
                }
                this.isTilemapLiteral = true;
                // This matches the regex for the field editor, so it should always match
                var match = /^\s*(tilemap(?:8|16|32)?)\s*(?:`([^`]*)`)|(?:\(\s*"""([^"]*)"""\s*\))\s*$/.exec(text);
                var name = (match[2] || match[3] || "").trim();
                this.tilemapLiteral = match[1];
                if (name) {
                    var id = ts.pxtc.escapeIdentifier(name);
                    var proj = project.getTilemap(id);
                    if (!proj) {
                        var tileWidth = 16;
                        if (this.tilemapLiteral === "tilemap8") {
                            tileWidth = 8;
                        }
                        else if (this.tilemapLiteral === "tilemap32") {
                            tileWidth = 32;
                        }
                        var _a = project.createNewTilemap(id, tileWidth, 16, 16), name_1 = _a[0], map = _a[1];
                        proj = map;
                        id = name_1;
                    }
                    this.tilemapName = id;
                    return proj;
                }
                return project.blankTilemap(16, 16, 16);
            };
            MonacoTilemapEditor.prototype.resultToText = function (result) {
                var project = pxt.react.getTilemapProject();
                project.pushUndo();
                if (result.deletedTiles) {
                    for (var _i = 0, _a = result.deletedTiles; _i < _a.length; _i++) {
                        var deleted = _a[_i];
                        project.deleteTile(deleted);
                    }
                }
                if (result.editedTiles) {
                    var _loop_3 = function (edit) {
                        var editedIndex = result.tileset.tiles.findIndex(function (t) { return t.id === edit; });
                        var edited = result.tileset.tiles[editedIndex];
                        // New tiles start with *. We haven't created them yet so ignore
                        if (!edited || edited.id.startsWith("*"))
                            return "continue";
                        result.tileset.tiles[editedIndex] = project.updateTile(edited.id, edited.bitmap);
                    };
                    for (var _b = 0, _c = result.editedTiles; _b < _c.length; _b++) {
                        var edit = _c[_b];
                        _loop_3(edit);
                    }
                }
                for (var i = 0; i < result.tileset.tiles.length; i++) {
                    var tile = result.tileset.tiles[i];
                    if (tile.id.startsWith("*")) {
                        var newTile = project.createNewTile(tile.bitmap);
                        result.tileset.tiles[i] = newTile;
                    }
                    else if (!tile.data) {
                        result.tileset.tiles[i] = project.resolveTile(tile.id);
                    }
                }
                pxt.sprite.trimTilemapTileset(result);
                if (this.isTilemapLiteral) {
                    if (this.tilemapName) {
                        project.updateTilemap(this.tilemapName, result);
                    }
                    else {
                        var _d = project.createNewTilemap(lf("level"), result.tileset.tileWidth, result.tilemap.width, result.tilemap.height), name_2 = _d[0], map = _d[1];
                        map.tilemap.apply(result.tilemap);
                        map.tileset = result.tileset;
                        map.layers = result.layers;
                        this.tilemapName = name_2;
                    }
                    return this.fileType === "typescript" ? "tilemap`" + this.tilemapName + "`" : "tilemap(\"\"\"" + this.tilemapName + "\"\"\")";
                }
                else {
                    return pxt.sprite.encodeTilemap(result, this.fileType === "typescript" ? "typescript" : "python");
                }
            };
            MonacoTilemapEditor.prototype.getFieldEditorId = function () {
                return "tilemap-editor";
            };
            MonacoTilemapEditor.prototype.getOptions = function () {
                return {
                    initWidth: 16,
                    initHeight: 16,
                    blocksInfo: this.host.blocksInfo()
                };
            };
            MonacoTilemapEditor.prototype.getCreateTilemapRange = function () {
                var start = this.editrange.getStartPosition();
                var current = this.editrange.getEndPosition();
                var range;
                var openParen = 1;
                while (true) {
                    range = new monaco.Range(current.lineNumber, current.column, current.lineNumber + 1, 0);
                    var line = this.host.getText(range);
                    for (var i = 0; i < line.length; i++) {
                        if (line.charAt(i) === "(") {
                            openParen++;
                        }
                        else if (line.charAt(i) === ")") {
                            openParen--;
                            if (openParen === 0) {
                                var end = new monaco.Position(current.lineNumber, current.column + i + 2);
                                return monaco.Range.fromPositions(start, end);
                            }
                        }
                    }
                    current = range.getEndPosition();
                    if (current.lineNumber > start.lineNumber + 20) {
                        return null;
                    }
                }
            };
            return MonacoTilemapEditor;
        }(editor.MonacoReactFieldEditor));
        editor.MonacoTilemapEditor = MonacoTilemapEditor;
        editor.tilemapEditorDefinition = {
            id: fieldEditorId,
            foldMatches: true,
            alwaysBuildOnClose: true,
            glyphCssClass: "sprite-focus-hover ms-Icon ms-Icon--Nav2DMapView",
            heightInPixels: 510,
            weight: 5,
            matcher: {
                // match both JS and python
                searchString: "(?:tilemap(?:8|16|32)?\\s*(?:`|\\(\"\"\")(?:[ a-zA-Z0-9_]|\\n)*\\s*(?:`|\"\"\"\\)))|(?:tiles\\s*\\.\\s*createTilemap\\s*\\([^\\)]+\\))",
                isRegex: true,
                matchCase: true,
                matchWholeWord: false
            },
            proto: MonacoTilemapEditor
        };
        editor.registerMonacoFieldEditor(fieldEditorId, editor.tilemapEditorDefinition);
    })(editor = pxt.editor || (pxt.editor = {}));
})(pxt || (pxt = {}));
